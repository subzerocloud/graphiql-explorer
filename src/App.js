// @flow
import React, { Component } from "react";
import GraphiQL from "graphiql";
import GraphiQLExplorer from "graphiql-explorer";
import { buildClientSchema, getIntrospectionQuery, parse } from "graphql";

import { makeDefaultArg, getDefaultScalarArgValue } from "./CustomArgs";

import "graphiql/graphiql.css";
import "./App.css";

import type { GraphQLSchema } from "graphql";

function fetcher(params: Object): Object {
  return fetch('/graphql/' + (params.schema_type || 'simple'), {
    method: 'post',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': params.auth_token ? 'Bearer ' + params.auth_token : null
    },
    body: JSON.stringify(params),
    credentials: 'include',
  }).then(function (response) {
    return response.text();
  }).then(function (responseBody) {
    try {
      return JSON.parse(responseBody);
    } catch (error) {
      return responseBody;
    }
  });
}

const DEFAULT_QUERY = ``;

type State = {
  schema: ?GraphQLSchema,
  query: string,
  explorerIsOpen: boolean,
  auth_token: '',
  schema_type: props.schema_type,
};

class App extends Component<{}, State> {
  _graphiql: GraphiQL;
  state = { 
    schema: null, 
    query: DEFAULT_QUERY, 
    explorerIsOpen: true,
    auth_token: '',
    schema_type: 'simple',
    parameters: {}
  };


  componentDidMount() {
    // Parse the search string to get url parameters.
    var search = window.location.search;
    var parameters = {};
    search.substr(1).split('&').forEach(function (entry) {
      var eq = entry.indexOf('=');
      if (eq >= 0) {
        parameters[decodeURIComponent(entry.slice(0, eq))] =
          decodeURIComponent(entry.slice(eq + 1));
      }
    });

    // if variables was provided, try to format it.
    if (parameters.variables) {
      try {
        parameters.variables =
          JSON.stringify(JSON.parse(parameters.variables), null, 2);
      } catch (e) {
        // Do nothing, we want to display the invalid JSON as a string, rather
        // than present an error.
      }
    }
    const schemaType = parameters.schemaType?parameters.schemaType:this.state.schema_type;
    this.setState({parameters: parameters, schema_type: schemaType}, ()=>{
      this._fetcher({
        query: getIntrospectionQuery()
      }).then(result => {
        const editor = this._graphiql.getQueryEditor();
        editor.setOption("extraKeys", {
          ...(editor.options.extraKeys || {}),
          "Shift-Alt-LeftClick": this._handleInspectOperation
        });
  
        this.setState({ schema: buildClientSchema(result.data) });
        
      });
    })
  };
  
  _updateURL = () => {
    let parameters = this.state.parameters;
    var newSearch = '?' + Object.keys(parameters).filter(function (key) {
      return Boolean(parameters[key]);
    }).map(function (key) {
      return encodeURIComponent(key) + '=' +
        encodeURIComponent(parameters[key]);
    }).join('&');
    // eslint-disable-next-line no-restricted-globals
    history.replaceState(null, null, newSearch);
  }

  _handleInspectOperation = (
    cm: any,
    mousePos: { line: Number, ch: Number }
  ) => {
    const parsedQuery = parse(this.state.query || "");

    if (!parsedQuery) {
      console.error("Couldn't parse query document");
      return null;
    }

    var token = cm.getTokenAt(mousePos);
    var start = { line: mousePos.line, ch: token.start };
    var end = { line: mousePos.line, ch: token.end };
    var relevantMousePos = {
      start: cm.indexFromPos(start),
      end: cm.indexFromPos(end)
    };

    var position = relevantMousePos;

    var def = parsedQuery.definitions.find(definition => {
      if (!definition.loc) {
        console.log("Missing location information for definition");
        return false;
      }

      const { start, end } = definition.loc;
      return start <= position.start && end >= position.end;
    });

    if (!def) {
      console.error(
        "Unable to find definition corresponding to mouse position"
      );
      return null;
    }

    var operationKind =
      def.kind === "OperationDefinition"
        ? def.operation
        : def.kind === "FragmentDefinition"
        ? "fragment"
        : "unknown";

    var operationName =
      def.kind === "OperationDefinition" && !!def.name
        ? def.name.value
        : def.kind === "FragmentDefinition" && !!def.name
        ? def.name.value
        : "unknown";

    var selector = `.graphiql-explorer-root #${operationKind}-${operationName}`;

    var el = document.querySelector(selector);
    el && el.scrollIntoView();
  };

  _handleEditQuery = (query: string): void => this.setState({ query });

  _handleToggleExplorer = () => {
    this.setState({ explorerIsOpen: !this.state.explorerIsOpen });
  };
  _onAuthTokenChange = (e) => {
    this.setState({auth_token: e.target.value});
  }
  _onSchemaTypeChange = (e) => {
    let parameters = this.state.parameters;
    parameters.schemaType = e.target.value;
    this.setState({schema_type: e.target.value, parameters: parameters});
    this._updateURL();

    window.location.reload();
  }

  _fetcher = (params) => {
    params.auth_token = this.state.auth_token
    params.schema_type = this.state.schema_type
    params.graphql_endpoint = this.props.graphql_endpoint
    return fetcher(params)
  }

  render() {
    const { query, schema } = this.state;
    return (
      <div className="graphiql-container">
        <GraphiQLExplorer
          schema={schema}
          query={query}
          onEdit={this._handleEditQuery}
          onRunOperation={operationName =>
            this._graphiql.handleRunQuery(operationName)
          }
          explorerIsOpen={this.state.explorerIsOpen}
          onToggleExplorer={this._handleToggleExplorer}
          getDefaultScalarArgValue={getDefaultScalarArgValue}
          makeDefaultArg={makeDefaultArg}
        />
        <GraphiQL
          ref={ref => (this._graphiql = ref)}
          fetcher={this._fetcher}
          schema={schema}
          query={query}
          onEditQuery={this._handleEditQuery}
        >
          <GraphiQL.Toolbar>
            <GraphiQL.Button
              onClick={() => this._graphiql.handlePrettifyQuery()}
              label="Prettify"
              title="Prettify Query (Shift-Ctrl-P)"
            />
            <GraphiQL.Button
              onClick={() => this._graphiql.handleToggleHistory()}
              label="History"
              title="Show History"
            />
            <GraphiQL.Button
              onClick={this._handleToggleExplorer}
              label="Explorer"
              title="Toggle Explorer"
            />
            <select className="schema-select"  onChange={this._onSchemaTypeChange} value={this.state.schema_type}>
              <option value="simple">Simple Schema</option>
              <option value="relay">Relay Schema</option>
            </select>

            <input className="auth-token" onChange={this._onAuthTokenChange} value={this.state.auth_token} placeholder="JWT value" />
          </GraphiQL.Toolbar>
        </GraphiQL>
      </div>
    );
  }
}

export default App;
