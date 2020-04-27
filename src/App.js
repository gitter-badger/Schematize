import { Layer, Stage } from "react-konva";
import React, { Component } from "react";

import "./App.css";
import PangenomeSchematic from "./PangenomeSchematic";
import ComponentRect, { compress_visible_rows } from "./ComponentRect";
import ComponentRectNucleotides from "./ComponentRectNucleotides";
import LinkColumn from "./LinkColumn";
import LinkArrow from "./LinkArrow";
import { calculateLinkCoordinates } from "./LinkRecord";
import NucleotideTooltip from "./NucleotideTooltip";
import ControlHeader from "./ControlHeader";
import { observe } from "mobx";
import { Rect, Text } from "react-konva";

function stringToColor(linkColumn, highlightedLinkColumn) {
  const colorKey = (linkColumn.downstream + 1) * (linkColumn.upstream + 1);
  if (
    highlightedLinkColumn &&
    colorKey ===
      (highlightedLinkColumn.downstream + 1) *
        (highlightedLinkColumn.upstream + 1)
  ) {
    return "black";
  } else {
    return stringToColourSave(colorKey);
  }
}

const stringToColourSave = function (colorKey) {
  colorKey = colorKey.toString();
  let hash = 0;
  for (let i = 0; i < colorKey.length; i++) {
    hash = colorKey.charCodeAt(i) + ((hash << 5) - hash);
  }
  let colour = "#";
  for (let j = 0; j < 3; j++) {
    const value = (hash >> (j * 8)) & 0xff;
    colour += ("00" + value.toString(16)).substr(-2);
  }
  return colour;
};

class App extends Component {
  layerRef = React.createRef();
  layerRef2 = React.createRef(null);
  layerRef3 = React.createRef(null);

  constructor(props) {
    super(props);

    this.updateHighlightedNode = this.updateHighlightedNode.bind(this);

    this.state = {
      schematize: [],
      pathNames: [],
      loading: true,
      actualWidth: 1,
      buttonsHeight: 0,
    };

    this.schematic = new PangenomeSchematic({ store: this.props.store }); // Read file, parse nothing
    observe(
      this.props.store.beginEndBin,
      this.updateSchematicMetadata.bind(this)
    );

    // TODO: endBin observer is still double triggering on shift() buttons. wait for beginBin event?
    observe(this.props.store, "pixelsPerRow", this.recalcY.bind(this));
    observe(
      this.props.store,
      "useVerticalCompression",
      this.recalcY.bind(this)
    );
    observe(
      this.props.store,
      "useWidthCompression",
      this.recalcXLayout.bind(this)
    );
    observe(
      this.props.store,
      "colorByGeo",
      this.recalcY.bind(this)
    );
    observe(this.props.store, "useConnector", this.recalcXLayout.bind(this));
    observe(
      this.props.store,
      "binScalingFactor",
      this.recalcXLayout.bind(this)
    );
    observe(this.props.store, "pixelsPerColumn", this.recalcXLayout.bind(this));
    observe(this.props.store.chunkURLs, this.nextChunk.bind(this));
    // this.nextChunk();
  }
  nextChunk() {
    console.log("nextChunk", this.props.store.getChunkURLs()[0]);
    if (!this.props.store.getChunkURLs()[0]) {
      console.log("no");
      return;
    }
    this.schematic
      .jsonFetch(this.props.store.getChunkURLs()[0])
      .then(this.queueUpdate.bind(this));
  }
  queueUpdate(data) {
    console.log("queueUpdate", this.props.store.getChunkURLs()[0]);
    this.schematic.loadFirstJSON(data);
    this.updateSchematicMetadata(true);
  }
  updateSchematicMetadata(processingDone = false) {
    if (this.schematic.processArray()) {
      console.log(
        "updateSchematicMetadata #components: " +
          this.schematic.components.length
      );

      // console.log(this.schematic.components);
      this.setState(
        {
          schematize: this.schematic.components,
          pathNames: this.schematic.pathNames,
        },
        () => {
          this.recalcXLayout();
          this.compressed_row_mapping = compress_visible_rows(
            this.schematic.components
          );
          this.maxNumRowsAcrossComponents = this.calcMaxNumRowsAcrossComponents(
            this.schematic.components
          ); // TODO add this to mobx-state-tree
          this.setState({ loading: false });
        }
      );
    }
  }
  recalcXLayout() {
    console.log("recalcXLayout");
    const sum = (accumulator, currentValue) => accumulator + currentValue;
    const columnsInComponents = this.schematic.components
      .map(
        (component) =>
          component.arrivals.length +
          (component.departures.length - 1) +
          (this.props.store.useWidthCompression
            ? this.props.store.binScalingFactor
            : component.lastBin - component.firstBin) +
          1
      )
      .reduce(sum, 0);
    const paddingBetweenComponents =
      this.props.store.pixelsPerColumn * this.schematic.components.length;
    const actualWidth =
      columnsInComponents * this.props.store.pixelsPerColumn +
      paddingBetweenComponents;
    this.setState({
      actualWidth: actualWidth,
    });
    const [links, top] = calculateLinkCoordinates(
      this.schematic.components,
      this.props.store.pixelsPerColumn,
      this.props.store.topOffset,
      this.props.store.useWidthCompression,
      this.props.store.binScalingFactor,
      this.leftXStart.bind(this)
    );
    this.distanceSortedLinks = links;
    this.props.store.updateTopOffset(parseInt(top));
  }

  recalcY() {
    // forceUpdate() doesn't work with callback function
    this.setState({ highlightedLink: null }); // nothing code to force update.
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (
      this.props.store.getBeginBin() !== prevProps.store.getBeginBin() ||
      this.props.store.getEndBin() !== prevProps.store.getEndBin()
    ) {
      this.updateSchematicMetadata();
    }
  }

  calcMaxNumRowsAcrossComponents(components) {
    let maxNumberRowsInOneComponent = 0;
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const occupants = component.occupants;
      const numberOccupants = occupants.filter(Boolean).length;
      maxNumberRowsInOneComponent = Math.max(
        numberOccupants,
        maxNumberRowsInOneComponent
      );
    }
    console.log(
      "Max number of rows across components: " + maxNumberRowsInOneComponent
    );

    return maxNumberRowsInOneComponent;
  }

  visibleHeight() {
    if (
      this.props.store.useVerticalCompression ||
      !this.compressed_row_mapping
    ) {
      // this.state.schematize.forEach(value => Math.max(value.occupants.filter(Boolean).length, maxNumberRowsInOneComponent));
      if (this.maxNumRowsAcrossComponents === undefined) {
        this.maxNumRowsAcrossComponents = this.calcMaxNumRowsAcrossComponents(
          this.schematic.components
        );
      }
      console.log(
        "maxNumRowsAcrossComponents",
        this.maxNumRowsAcrossComponents
      );
      return (
        (this.maxNumRowsAcrossComponents + 2.5) * this.props.store.pixelsPerRow
      );
    } else {
      return (
        (Object.keys(this.compressed_row_mapping).length + 0.25) *
        this.props.store.pixelsPerRow
      );
    }
  }
  UNSAFE_componentWillMount() {
    this.updateSchematicMetadata();
  }

  componentDidMount = () => {
    let buttonContainerDiv = document.getElementById("button-container");
    buttonContainerDiv.style.position = "sticky";
    buttonContainerDiv.style.top = "0";
    buttonContainerDiv.style.background = "white";
    buttonContainerDiv.style.zIndex = 5;

    let clientHeight = buttonContainerDiv.clientHeight;

    const arrowsDiv = document.getElementsByClassName("konvajs-content")[0];
    arrowsDiv.style.position = "relative";
    //arrowsDiv.style.top =  clientHeight + "px";

    arrowsDiv.parentElement.style.position = "sticky";
    arrowsDiv.parentElement.style.top = "0";
    arrowsDiv.parentElement.style.background = "white";
    arrowsDiv.parentElement.style.zIndex = 5;

    this.setState({ buttonsHeight: clientHeight });

    this.layerRef.current.getCanvas()._canvas.id = "cnvs";
    this.layerRef.current.getCanvas()._canvas.position = "relative";

    this.layerRef2.current.getCanvas()._canvas.id = "arrow";
    this.layerRef2.current.getCanvas()._canvas.position = "relative";
    //this.layerRef2.current.getCanvas()._canvas.style.top = "95px";
    /*        if(this.props.store.useVerticalCompression) {
            this.props.store.resetRenderStats(); //FIXME: should not require two renders to get the correct number
        }*/
  };

  updateHighlightedNode = (linkRect) => {
    this.setState({ highlightedLink: linkRect });
    this.recalcXLayout();
    // this.props.store.updateHighlightedLink(linkRect); // TODO this does not work, ask Robert about it
  };

  leftXStart(schematizeComponent, i, firstDepartureColumn, j) {
    /* Return the x coordinate pixel that starts the LinkColumn at i, j*/
    let previousColumns = !this.props.store.useWidthCompression
      ? schematizeComponent.firstBin -
        this.props.store.getBeginBin() +
        schematizeComponent.offset
      : schematizeComponent.offset +
        (schematizeComponent.index - this.schematic.components[0].index) *
          this.props.store.binScalingFactor;
    let pixelsFromColumns =
      (previousColumns + firstDepartureColumn + j) *
      this.props.store.pixelsPerColumn;
    return pixelsFromColumns + i * this.props.store.pixelsPerColumn;
  }

  renderComponent(schematizeComponent, i, pathNames) {
    return (
      <>
        <ComponentRect
          store={this.props.store}
          item={schematizeComponent}
          key={i}
          height={this.visibleHeight()}
          width={
            schematizeComponent.arrivals.length +
            (this.props.store.useWidthCompression
              ? this.props.store.binScalingFactor
              : schematizeComponent.num_bin) +
            (schematizeComponent.departures.length - 1)
          }
          compressed_row_mapping={this.compressed_row_mapping}
          pathNames={pathNames}
          nucleotides={this.schematic.nucleotides}
        />

        {schematizeComponent.arrivals.map((linkColumn, j) => {
          return this.renderLinkColumn(
            schematizeComponent,
            i,
            0,
            j,
            linkColumn
          );
        })}
        {schematizeComponent.departures.slice(0, -1).map((linkColumn, j) => {
          let leftPad =
            schematizeComponent.arrivals.length +
            (this.props.store.useWidthCompression
              ? this.props.store.binScalingFactor
              : schematizeComponent.num_bin);
          return this.renderLinkColumn(
            schematizeComponent,
            i,
            leftPad,
            j,
            linkColumn
          );
        })}
      </>
    );
  }

  renderLinkColumn(
    schematizeComponent,
    i,
    firstDepartureColumn,
    j,
    linkColumn
  ) {
    const xCoordArrival = this.leftXStart(
      schematizeComponent,
      i,
      firstDepartureColumn,
      j
    );
    const localColor = stringToColor(linkColumn, this.state.highlightedLink);
    return (
      <LinkColumn
        store={this.props.store}
        key={"departure" + i + j}
        item={linkColumn}
        pathNames={this.state.pathNames}
        x={xCoordArrival}
        pixelsPerRow={this.props.store.pixelsPerRow}
        width={this.props.store.pixelsPerColumn}
        color={localColor}
        updateHighlightedNode={this.updateHighlightedNode}
        compressed_row_mapping={this.compressed_row_mapping}
      />
    );
  }

  renderLink(link) {
    return (
      <LinkArrow
        store={this.props.store}
        key={"arrow" + link.linkColumn.key}
        link={link}
        color={stringToColor(link.linkColumn, this.state.highlightedLink)}
        updateHighlightedNode={this.updateHighlightedNode}
      />
    );
  }

  renderNucleotidesSchematic = () => {
    if (this.state.loading) {
      return <Text text="Loading..." fontSize={60} />;
    }
    return this.schematic.components.map((schematizeComponent, i) => {
      return (
        <React.Fragment key={"f" + i}>
          <ComponentRectNucleotides
            store={this.props.store}
            item={schematizeComponent}
            key={i}
            height={this.visibleHeight()}
            width={
              schematizeComponent.arrivals.length +
              (this.props.store.useWidthCompression
                ? this.props.store.binScalingFactor
                : schematizeComponent.num_bin) +
              (schematizeComponent.departures.length - 1)
            }
            compressed_row_mapping={this.compressed_row_mapping}
            pathNames={this.state.pathNames}
            nucleotides={this.schematic.nucleotides}
          />
        </React.Fragment>
      );
    });
  };

  renderSchematic = () => {
    if (this.state.loading) {
      return <Text text="Loading..." fontSize={60} />;
    }
    return this.schematic.components.map((schematizeComponent, i) => {
      return (
        <React.Fragment key={"f" + i}>
          {this.renderComponent(schematizeComponent, i, this.state.pathNames)}
        </React.Fragment>
      );
    });
  };

  renderSortedLinks = () => {
    if (this.state.loading) {
      return;
    }

    return this.distanceSortedLinks.map((record, i) => {
      return this.renderLink(record);
    });
  };

  render() {
    console.log("Start render");
    return (
      <>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: "2",
          }}
        >
          <ControlHeader store={this.props.store} schematic={this.schematic} />

          <Stage
            x={this.props.store.leftOffset}
            y={this.props.topOffset}
            width={this.state.actualWidth + 60}
            height={this.props.store.topOffset}
          >
            <Layer ref={this.layerRef2}>
              {this.renderSortedLinks()}
              {this.renderNucleotidesSchematic()}
            </Layer>
          </Stage>
        </div>

        <Stage
          x={this.props.store.leftOffset} // removed leftOffset to simplify code.  Relative coordinates are always better.
          y={-this.props.store.topOffset} // AG: for some reason, I have to put this, but I'd like to put 0
          width={this.state.actualWidth + 60}
          height={this.visibleHeight() + this.props.store.nucleotideHeight}
        >
          <Layer ref={this.layerRef}>{this.renderSchematic()}</Layer>
        </Stage>

        <NucleotideTooltip store={this.props.store} />
      </>
    );
  }
}

// render(<App />, document.getElementById('root'));

export default App;
