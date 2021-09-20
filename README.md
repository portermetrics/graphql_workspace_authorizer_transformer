> 🚒 Add a simple interceptor to all of your Amplify API mutations and queries!

# graphql-workspace-authorizer-transformer

## Installation

`npm install --save graphql-workspace-authorizer-transformer`

## How to use

### Setup custom transformer

Edit `amplify/backend/api/<YOUR_API>/transform.conf.json` and append `"graphql-workspace-authorizer-transformer"` to the `transformers` field.

```json
"transformers": [
    "graphql-workspace-authorizer-transformer"
]
```

### Use @workspace directive

Append `@workspace` to target types and add the name of the separately deployed function that should be called for every mutation and query to this type as argument.

```graphql
type Todo @model @workspaceAuth(dataSourceName: "auditlog-${env}", userField: "owner", indexName: "byUser", roleField: "owner", allowedRoles: ["Editor", "Admin", "Owner"]) {
  id: ID!
  title: String!
  description: String
}
```

In this example, the `auditlog-${env}` lambda will be called before every mutation or query to the `Todo` type, which is ideal to build an audit logger for example.

**If you deployed your function using the 'amplify function' category**

The Amplify CLI provides support for maintaining multiple environments out of the box. When you deploy a function via `amplify add function`, it will automatically add the environment suffix to your Lambda function name. For example if you create a function named **auditlog** using `amplify add function` in the **dev** environment, the deployed function will be named **auditlog-dev**. The `@firehose` directive allows you to use `${env}` to reference the current Amplify CLI environment.

```graphql
type Todo @model @workspaceAuth(name: "auditlog-${env}") {
  id: ID!
  title: String!
  description: String
}
```

**If you deployed your function without amplify**

If you deployed your API without amplify then you must provide the full Lambda function name. If you deployed the same function with the name **auditlog** then you would have:

```graphql
type Todo @model @workspaceAuth(name: "auditlog") {
  id: ID!
  title: String!
  description: String
}
```

#### Calling functions in different regions

By default, you expect the function to be in the same region as the amplify project. If you need to call a function in a different (or static) region, you can provide the **region** argument.

```graphql
type Todo @model @workspaceAuth(name: "auditlog", region: "us-east-1") {
  id: ID!
  title: String!
  description: String
}
```

Calling functions in different AWS accounts is not supported via the @firehose directive but is supported by AWS AppSync.

#### Structure of the function event

When writing lambda functions that are connected via the `@workspace` directive, you can expect the following structure for the AWS Lambda event object.

| Key       | Description                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typeName  | Either `Mutation` or `Query`.                                                                                                                                          |
| fieldName | The mutation or query type field that was called, e.g. `createTodo`.                                                                                                   |
| arguments | A map containing the arguments passed to the field being resolved.                                                                                                     |
| identity  | A map containing identity information for the request. Contains a nested key 'claims' that will contains the JWT claims if they exist.                                 |
| source    | When resolving a nested field in a query, the source contains parent value at runtime. For example when resolving `Post.comments`, the source will be the Post object. |
| request   | The AppSync request object. Contains header information.                                                                                                               |
| prev      | When using pipeline resolvers, this contains the object returned by the previous function. You can return the previous value for auditing use cases.                   |

## Contribute 🦸

Please feel free to create, comment and of course solve some of the issues. To get started you can also go for the easier issues marked with the `good first issue` label if you like.

### Development

- It is important to always make sure the version of the installed `graphql` dependency matches the `graphql` version the `graphql-transformer-core` depends on.

## License

The [MIT License](LICENSE)

## Credits

The _graphql-workspace-authorizer-transformer_ library is maintained by Porter Metrics