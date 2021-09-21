import { GraphQLTransform } from "graphql-transformer-core";
import { DynamoDBModelTransformer } from "graphql-dynamodb-transformer";
import WorkspaceAuthorizerTransformer from "../index";

// @ts-ignore
import { AppSyncTransformer } from "graphql-appsync-transformer";

import {
  plurality,
} from "graphql-transformer-common";

const transformer = new GraphQLTransform({
  transformers: [
    new AppSyncTransformer(),
    new DynamoDBModelTransformer(),
    new WorkspaceAuthorizerTransformer(),
  ],
});

test("@workspaceAuth directive can be used on types", () => {
  const schema = `
    type Todo @model @workspaceAuth {
      id: ID!
      title: String!
      description: String
    }
  `;
  expect(() => transformer.transform(schema)).not.toThrow();
});

test("@workspaceAuth directive can not be used on fields", () => {
  const schema = `
    type ExpiringChatMessage @model {
      id: ID!
      title: String!
      description: String @workspaceAuth
    }
  `;
  expect(() => transformer.transform(schema)).toThrowError(
    'Directive "workspaceAuth" may not be used on FIELD_DEFINITION.'
  );
});

test("@workspaceAuth directive must be used together with @model directive", () => {
  const schema = `
      type Todo @workspaceAuth {
        id: ID!
        title: String!
        description: String
      }
    `;
  expect(() => transformer.transform(schema)).toThrowError(
    "Types annotated with @workspaceAuth must also be annotated with @model."
  );
});

test("Transformer can be executed without errors", () => {
  const schema = `
    type Todo @model @workspaceAuth {
        id: ID!
        title: String!
        description: String
    }
  `;
  transformer.transform(schema);
});
