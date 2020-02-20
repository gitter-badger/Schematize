import React from 'react';
import {Observer} from 'mobx-react';

class ControlHeader extends React.Component{
    render() {
        return (
        <div style={{'marginBottom':'15px'}}>
            <a href="#" className="button" id="btn-download">Download</a>
            <span> Use Vertical Compression:
                <CompressedViewSwitch store={this.props.store}/>
            </span>
            <span> Pangenome Position:
                <input type="number" defaultValue={this.props.store.beginBin}
                       onChange={this.props.store.updateStart} style={{width: '80px'}}/>-
                <input type="number" defaultValue={this.props.store.endBin}
                       onChange={this.props.store.updateEnd} style={{width: '80px'}}/>
            </span>
            <span> Row Height:
                <input type="number" defaultValue={this.props.store.pixelsPerRow}
                       onChange={this.props.store.updateHeight} style={{width: '30px'}}/>
            </span>
            <span> Column Width:
                <input type="number" defaultValue={this.props.store.pixelsPerColumn}
                       onChange={this.props.store.updateWidth} style={{width: '30px'}}/>

            </span>
        </div>
        )
    }
}

class CompressedViewSwitch extends React.Component {
    onToggle() {
        this.props.store.toggleUseVerticalCompression();
    }
    render() {
        return (
            <input
                type="checkbox"
                checked={<Observer>{() => this.props.store.useVerticalCompression}</Observer>}
                onChange={this.onToggle.bind(this)}
            />
        );
    }
}

export default ControlHeader