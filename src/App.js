import React, { Component } from "react";
import Amplify, { Auth, Storage, graphqlOperation, API } from "aws-amplify";
import { Connect, withAuthenticator } from "aws-amplify-react";
import { Grid, Header, List, Segment, Menu, Button } from "semantic-ui-react";
import "semantic-ui-css/semantic.css";

Amplify.configure({
  Auth: {
    identityPoolId: "us-east-1:516132f0-8056-4450-a1d5-fd4e6f877845",
    region: "us-east-1",
    userPoolId: "us-east-1_QZ3Aa0LBe",
    userPoolWebClientId: "5s6jmc25o0vm3vui34r9vh580j"
  },
  aws_appsync_graphqlEndpoint: "https://graphql.dlozitskiy.online",
  aws_appsync_region: "us-east-1",
  aws_appsync_authenticationType: "AMAZON_COGNITO_USER_POOLS"
});

Storage.configure({
  bucket: "bucket-with-protected-content",
  region: "us-east-1",
  identityPoolId: "us-east-1:516132f0-8056-4450-a1d5-fd4e6f877845"
});

const putObject = `mutation putObject($objectId: String!){
  putObject(objectId: $objectId, state: true) {
    objectId
    userId
    state
  }
}`;

class S3Upload extends React.Component {
  constructor(props) {
    super(props);
    this.state = { uploading: false };
  }
  onChange = async e => {
    const file = e.target.files[0];
    this.setState({ uploading: true });
    const identityId = await Auth.currentSession()
      .then(data => {
        return data.idToken.payload.sub;
      })
      .catch(err => console.log(err));
    const result = await Storage.put(file.name, file, {
      identityId: identityId,
      level: "private",
      customPrefix: { private: "" }
    }).then(async () => {
      const result = await API.graphql(
        graphqlOperation(putObject, { objectId: file.name })
      );
      console.info(`Created object with id ${JSON.stringify(result)}`);
    });
    this.setState({ uploading: false });
  };
  render() {
    return (
      <div>
        <Button
          primary
          onClick={() => document.getElementById("uploadFile").click()}
          disabled={this.state.uploading}
          content={this.state.uploading ? "Uploading..." : "Upload file"}
        />
        <input
          id="uploadFile"
          type="file"
          onChange={this.onChange}
          style={{ display: "none" }}
        />
      </div>
    );
  }
}

const deleteObject = `mutation deleteObject($objectId: String!){
          deleteObject(objectId: $objectId) {
            objectId
           userId
          }
        }`;

class S3Delete extends React.Component {
  constructor(props) {
    super(props);
    this.state = { deleting: false };
  }
  onClick = async e => {
    const file = this.props.file;
    this.setState({ deleting: true });
    const identityId = await Auth.currentSession()
      .then(data => {
        return data.idToken.payload.sub;
      })
      .catch(err => console.log(err));
    const result = await Storage.remove(file, {
      identityId: identityId,
      level: "private",
      customPrefix: { private: "" }
    }).then(async () => {
      const result = await API.graphql(
        graphqlOperation(deleteObject, { objectId: file, userId: identityId })
      );
      console.info(`Deleted object with id ${JSON.stringify(result)}`);
    });
  };
  render() {
    return (
      <div>
        <Button
          negative
          onClick={this.onClick}
          disabled={this.state.deleting}
          content={this.state.deleting ? "Deleting..." : "Delete"}
        />
      </div>
    );
  }
}

const getObject = `query getObject($objectId: String!){
          getObject(objectId: $objectId) {
            url
          }
        }`;

class FileList extends React.Component {
  getUrl = async file => {
    const result = await API.graphql(
      graphqlOperation(getObject, { objectId: file })
    );
    window.location.assign(result.data.getObject.url);
  };
  Files() {
    if (this.props.files.length != 0) {
      return this.props.files.map(file => (
        <List.Item key={file.objectId}>
          <List.Content floated="right">
            <S3Delete file={file.objectId} />
          </List.Content>
          <List.Content
            as="a"
            href="javascript:void(0)"
            onClick={() => {
              this.getUrl(file.objectId);
            }}
          >
            {file.objectId}
          </List.Content>
        </List.Item>
      ));
    } else {
      return (
        <List.Item>
          <List.Content>Your filestore is empty</List.Content>
        </List.Item>
      );
    }
  }
  render() {
    return (
      <Segment>
        <List divided verticalAlign="middle">
          {this.Files()}
        </List>
      </Segment>
    );
  }
}

const getObjects = `query {
	getObjects {
		objectId
	}
}`;

const onObjectModify = `
  subscription onObjectModify ($userId: String){
    onObjectModify (userId: $userId){
      userId
    }
  }
`;

class FilesListLoader extends React.Component {
  constructor(props) {
    super(props);
    this.state = { identityId: "" };
  }
  async componentDidMount() {
    await Auth.currentSession().then(data => {
      this.setState({ identityId: data.idToken.payload.sub });
    });
  }
  render() {
    return (
      this.state.identityId != "" && (
        <Connect
          query={graphqlOperation(getObjects)}
          subscription={graphqlOperation(onObjectModify, {
            userId: this.state.identityId
          })}
          onSubscriptionMsg={(prev, { onObjectModify }) => {
            var index = prev.getObjects.findIndex(
              obj => obj.objectId === onObjectModify.objectId
            );
            if (!onObjectModify.state) {
              prev.getObjects.splice(index, 1);
            } else {
              prev.getObjects.push(onObjectModify);
            }
            return prev;
          }}
        >
          {({ data, loading, errors }) => {
            if (loading) {
              return <div>Loading...</div>;
            }
            if (!data.getObjects) return;
            return <FileList files={data.getObjects} />;
          }}
        </Connect>
      )
    );
  }
}

class App extends Component {
  signOut = async () => {
    await Auth.signOut();
    this.props.rerender();
  };
  render() {
    return (
      <Grid padded>
        <Grid.Column>
          <Menu>
            <Menu.Item>
              <S3Upload />
            </Menu.Item>
            <Menu.Item>
              <Button onClick={this.signOut}>Sign-out</Button>
            </Menu.Item>
          </Menu>
          <Segment>
            <Header as="h3">My Files</Header>
          </Segment>
          <FilesListLoader />
        </Grid.Column>
      </Grid>
    );
  }
}

export default props => {
  const AppComponent = withAuthenticator(App);
  return <AppComponent {...props} />;
};
