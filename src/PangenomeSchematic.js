import React from "react";
import { observe } from "mobx";
import { urlExists } from "./URL";

class PangenomeSchematic extends React.Component {
  constructor(props) {
    /*Only plain objects will be made observable. For non-plain objects it is considered the
		 responsibility of the constructor to initialize the observable properties. Either use
		 the @observable annotation or the extendObservable function.*/

    super(props);
    this.pathNames = [];
    this.components = [];
    this.nucleotides = [];
    this.metadata = [];

    this.loadIndexFile(this.props.store.jsonName) //initializes this.chunk_index
      .then(() => this.jsonFetch(this.props.store.getChunkURLs()[0]))
      .then(this.loadFirstJSON.bind(this));
    this.loadMetadataFile(this.props.store.jsonName);

    //whenever jsonName changes,
    observe(this.props.store, "jsonName", () => {
      this.loadIndexFile(this.props.store.jsonName);
      this.loadMetadataFile(this.props.store.jsonName);
    });
    // console.log("public ", process.env.PUBLIC_URL ) //PUBLIC_URL is empty
  }
  componentDidUpdate() {
    // console.log("#components: " + this.components);
  }
  openRelevantChunk(chunk_index) {
    this.chunk_index = chunk_index;
    const beginBin = this.props.store.getBeginBin();
    const endBin = this.props.store.getEndBin();
    //only do a new chunk scan if it's needed
    let startFile = chunk_index["files"][0]["file"];
    this.loadFasta();
    let nextChunk = chunk_index["files"][0];
    for (let i = 0; i < chunk_index["files"].length; ++i) {
      //linear scan for the right chunk
      let chunk = chunk_index["files"][i];
      if (chunk["last_bin"] >= beginBin && chunk["first_bin"] <= beginBin) {
        startFile = chunk["file"]; // retrieve file name
        nextChunk = chunk; // fallback: if it's last chunk in series
        if (i + 1 < chunk_index["files"].length) {
          nextChunk = chunk_index["files"][i + 1];
        }
        console.log("Opening chunk", startFile, nextChunk["file"]);
        //restrict end position to end of the new chunk
        this.props.store.updateBeginEndBin(
          beginBin,
          Math.min(nextChunk["last_bin"], endBin)
        );
        break; // done scanning
      }
    }
    //will trigger chunk update in App.nextChunk() which calls this.loadJSON
    this.props.store.switchChunkURLs(
      process.env.PUBLIC_URL +
        "test_data/" +
        this.props.store.jsonName +
        "/" +
        startFile,
      process.env.PUBLIC_URL +
        "test_data/" +
        this.props.store.jsonName +
        "/" +
        nextChunk["file"]
    );
  }
  loadIndexFile(jsonFilename) {
    let indexPath =
      process.env.PUBLIC_URL + "test_data/" + jsonFilename + "/bin2file.json";
    console.log("Reading", indexPath);
    return fetch(indexPath)
      .then((res) => res.json())
      .then((json) => {
        if (!this.props.store.getChunkURLs()[0]) {
          // Initial state
          this.props.store.switchChunkURLs(
            `${process.env.PUBLIC_URL}test_data/${this.props.store.jsonName}/${json["files"][0]["file"]}`,
            `${process.env.PUBLIC_URL}test_data/${this.props.store.jsonName}/${json["files"][1]["file"]}`
          );
        }
        this.openRelevantChunk.call(this, json);
      });
  }
  jsonFetch(filepath) {
    if (!filepath)
      throw new Error(
        "No filepath given. Ensure chunknames in bin2file.json are correct."
      );

    console.log("Fetching", filepath);

    return fetch(process.env.PUBLIC_URL + filepath).then((res) => res.json());
  }
  loadFirstJSON(data) {
    this.jsonData = data;
    this.pathNames = this.jsonData.path_names;
    this.jsonData.mid_bin = data.last_bin; //placeholder
    let lastChunkURLIndex = this.props.store.chunkURLs.length - 1;
    if (
      this.props.store.getChunkURLs()[0] ===
      this.props.store.getChunkURLs()[lastChunkURLIndex]
    ) {
      this.processArray();
    } else {
      this.jsonFetch(this.props.store.getChunkURLs()[lastChunkURLIndex]).then(
        this.loadSecondJSON.bind(this)
      );
    }
  }
  loadSecondJSON(secondChunkContents) {
    if (this.jsonData.last_bin < secondChunkContents.last_bin) {
      this.jsonData.mid_bin = this.jsonData.last_bin; //boundary between two files
      this.jsonData.last_bin = secondChunkContents.last_bin;
      this.jsonData.components.push(...secondChunkContents.components);
      this.processArray();
    } else {
      console.warn(
        "Second chunk was earlier than the first.  Check the order you set store.chunkURLs"
      );
    }
  }
  loadFasta() {
    //find a way to make this less fragile
    const beginBin = this.props.store.getBeginBin();
    const endBin = this.props.store.getEndBin();
    const chunks = this.chunk_index;

    let chunkNo = chunks.files[0];

    if (beginBin > chunkNo.lastBin) {
      chunkNo = chunks.files[1];
    }

    const fastaFileName = `${process.env.PUBLIC_URL}/test_data/${this.props.store.jsonName}/${chunkNo.fasta}`;
    console.log("fetching", fastaFileName);
    fetch(fastaFileName)
      .then((response) => {
        return response.text();
      })
      .then((text) => {
        //remove first line
        const splitText = text.replace(/.*/, "").substr(1);
        const noLinebreaks = splitText.replace(/[\r\n]+/gm, "");
        const nucleotides = noLinebreaks.split("");
        //split into array of nucelotides
        if (!this.nucleotides.length) {
          this.nucleotides = nucleotides;
        } else {
          this.nucleotides.push(...nucleotides);
        }
        return;
      });
  }
  loadMetadataFile(jsonFilename) {
    const mdataPath = `${process.env.PUBLIC_URL}/test_data/${this.props.store.jsonName}/metadata.json`;
    if (urlExists(mdataPath)) {
      console.log("Reading", mdataPath);
      return fetch(mdataPath)
        .then((res) => res.json())
        .then((json) => {
          var metaData = {};
          // commented-out could be used further to read in the metadata categories 
          // into json_entries array.
          //let json_entries = [];
          for (let i=0; i<json.length; i++) {
            metaData[json[i][this.props.store.metaDataKey]] = json[i];
            // if (i == 0) {
            //   for (let [key, value] of Object.entries(json[0])) {
            //     json_entries.push(key);
            //   }
            //   this.props.store.setMetaDataChoices(json_entries);
            // }
          }
          this.props.store.setMetaData(metaData);
        });
    }
  }
  processArray() {
    /*parses beginBin to endBin range, returns false if new file needed*/
    if (!this.jsonData) {
      return false;
    }
    // eslint-disable-next-line prefer-const
    let [beginBin, endBin] = [
      this.props.store.getBeginBin(),
      this.props.store.getEndBin(),
    ];
    if (this.jsonData.json_version !== 12) {
      throw MediaError(
        "Wrong Data JSON version: was expecting version 12, got " +
        this.jsonData.json_version +
        ".  " +
        "This version added nucleotide ranges to bins.  " + // KEEP THIS UP TO DATE!
          "Using a mismatched data file and renderer will cause unpredictable behavior," +
          " instead generate a new data file using github.com/graph-genome/component_segmentation."
      );
    }
    this.props.store.setBinWidth(parseInt(this.jsonData.bin_width));
    console.log("Parsing components ", beginBin, " - ", endBin);
    //Fetch the next file when viewport no longer needs the first file.
    if (
      beginBin > this.jsonData.mid_bin ||
      beginBin < this.jsonData.first_bin
    ) {
      //only do a new chunk scan if it's needed
      this.openRelevantChunk(this.chunk_index);
      this.loadFasta(); // this will trigger a second update cycle
      return false;
    } else {
      var componentArray = [];
      var offsetLength = 0;
      for (let [index, component] of this.jsonData.components.entries()) {
        if (component.last_bin >= beginBin) {
          var componentItem = new Component(component, offsetLength, index);
          offsetLength +=
            componentItem.arrivals.length + componentItem.departures.length - 1;
          componentArray.push(componentItem);
          if (component.first_bin > endBin && componentArray.length > 1) {
            break;
          }
        }
      }
      this.components = componentArray;
      console.log(
        "processArray",
        this.jsonData.first_bin,
        this.jsonData.last_bin
      );
      return true;
    }
  }
}

class Component {
  constructor(component, offsetLength, index) {
    this.offset = offsetLength;
    this.index = index;
    this.firstBin = component.first_bin;
    this.lastBin = component.last_bin;
    this.arrivals = [];
    for (let arrival of component.arrivals) {
      this.arrivals.push(new LinkColumn(arrival));
    }
    this.departures = [];
    for (let departure of component.departures) {
      //don't slice off adjacent here
      this.departures.push(new LinkColumn(departure));
    }
    // we do not know the x val for this component, yet
    this.x = 0;
    // deep copy of occupants
    this.occupants = Array.from(component.occupants);
    this.matrix = Array.from(component.matrix);
    this.num_bin = this.lastBin - this.firstBin + 1;
  }
}

class LinkColumn {
  constructor(linkColumn) {
    this.upstream = linkColumn.upstream;
    this.downstream = linkColumn.downstream;
    this.participants = linkColumn.participants; //new Set
    this.key = this.edgeToKey();
  }
  edgeToKey() {
    /**downstream and upstream are always in the same orientation regardless of if it is a
     * departing LinkColumn or an arriving LinkColumn.**/
    return (
      String(this.downstream).padStart(13, "0") +
      String(this.upstream).padStart(13, "0")
    );
  }
}

export default PangenomeSchematic;
