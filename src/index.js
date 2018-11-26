import React from "react";
import ReactDOM from "react-dom";
import App from "./App";

class AuthWrapper extends React.Component {
  rerender = () => this.forceUpdate();
  render() {
    return <App rerender={this.rerender} />;
  }
}
ReactDOM.render(<AuthWrapper />, document.getElementById("root"));
