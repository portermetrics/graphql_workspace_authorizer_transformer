> 🚒 Add custom auth flow to all queries and mutations!

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
type Todo @model @workspaceAuth(ownershipModelName:"Ownership", userField:"userID", indexName:"byUser", roleField:"role", allowedRoles:["Editor", "Admin", "Owner"], relatedWorkspaceIDField:"companyID") {
  id: ID!
  title: String!
  description: String
}
```

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