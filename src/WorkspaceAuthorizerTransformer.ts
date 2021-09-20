import {
  Transformer,
  gql,
  TransformerContext,
  InvalidDirectiveError,
  getDirectiveArguments,
} from "graphql-transformer-core";
import {
  obj,
  str,
  ref,
  printBlock,
  print,
  compoundExpression,
  qref,
  raw,
  iff,
  int,
  forEach,
  bool,
  ifElse,
  nul,
  DynamoDBMappingTemplate,
} from "graphql-mapping-template";
import { AppSync, Fn, IAM } from "cloudform-types";
import { DirectiveNode, ObjectTypeDefinitionNode } from "graphql";
import {
  ModelResourceIDs,
  plurality,
  ResolverResourceIDs,
  ResourceConstants,
} from "graphql-transformer-common";

const WORKSPACE_AUTHORIZER_DIRECTIVE_STACK = "WorkspaceAuthorizerDirectiveStack";
const DYNAMODB_METADATA_KEY = "DynamoDBTransformerMetadata";

const lambdaArnKey = (name: string, region?: string) => {
  return region
    ? `arn:aws:lambda:${region}:\${AWS::AccountId}:function:${name}`
    : `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${name}`;
};

const referencesEnv = (value: string) => {
  return value.match(/(\${env})/) !== null;
};

const removeEnvReference = (value: string) => {
  return value.replace(/(-\${env})/, "");
};

const lambdaArnResource = (name: string, region?: string) => {
  const substitutions: any = {};
  if (referencesEnv(name)) {
    substitutions["env"] = Fn.Ref(ResourceConstants.PARAMETERS.Env);
  }
  return Fn.If(
    ResourceConstants.CONDITIONS.HasEnvironmentParameter,
    Fn.Sub(lambdaArnKey(name, region), substitutions),
    Fn.Sub(lambdaArnKey(removeEnvReference(name), region), {})
  );
};

export class WorkspaceAuthorizerTransformer extends Transformer {
  constructor() {
    super(
      "CompanyOwnershipTransformer",
      gql`
        directive @workspaceAuth(dataSourceName: String, userField: String, indexName: String, roleField: String, allowedRoles: [String]) on OBJECT
      `
    );
  }

  public object = (
    definition: ObjectTypeDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    this.validateObject(definition);

    // const firehoseLambdaFunctionId = this.createLambdaFunctionResources(
    //   directive,
    //   ctx
    // );

    const { ownershipModelName="Ownership", userField="userID", indexName="byUser", roleField="role", allowedRoles=["Editor", "Admin", "Owner"], relatedWorkspaceIDField="companyID" } = getDirectiveArguments(directive);

    
    this.createWorkspaceAuthorizerResolver(
      ctx,
      ownershipModelName,
      userField,
      indexName,
      roleField,
      allowedRoles,
      relatedWorkspaceIDField,
      ResolverResourceIDs.DynamoDBGetResolverResourceID(definition.name.value),
      "Query",
      `get${definition.name.value}`,
      `get${definition.name.value}`
    );
    this.createWorkspaceAuthorizerResolver(
      ctx,
      ownershipModelName,
      userField,
      indexName,
      roleField,
      allowedRoles,
      relatedWorkspaceIDField,
      ResolverResourceIDs.DynamoDBCreateResolverResourceID(
        definition.name.value
      ),
      "Mutation",
      `create${definition.name.value}`,
      `get${definition.name.value}`
    );
    this.createWorkspaceAuthorizerResolver(
      ctx,
      ownershipModelName,
      userField,
      indexName,
      roleField,
      allowedRoles,
      relatedWorkspaceIDField,
      ResolverResourceIDs.DynamoDBUpdateResolverResourceID(
        definition.name.value
      ),
      "Mutation",
      `update${definition.name.value}`,
      `get${definition.name.value}`
    );
    this.createWorkspaceAuthorizerResolver(
      ctx,
      ownershipModelName,
      userField,
      indexName,
      roleField,
      allowedRoles,
      relatedWorkspaceIDField,
      ResolverResourceIDs.DynamoDBDeleteResolverResourceID(
        definition.name.value
      ),
      "Mutation",
      `delete${definition.name.value}`,
      `get${definition.name.value}`
    );
    this.createWorkspaceAuthorizerResolver(
      ctx,
      ownershipModelName,
      userField,
      indexName,
      roleField,
      allowedRoles,
      relatedWorkspaceIDField,
      ResolverResourceIDs.DynamoDBListResolverResourceID(definition.name.value),
      "Query",
      plurality(`list${definition.name.value}`),
      `get${definition.name.value}`
    );
  };

  private validateObject = (definition: ObjectTypeDefinitionNode) => {
    const modelDirective = (definition.directives || []).find(
      (directive:any) => directive.name.value === "model"
    );
    if (!modelDirective) {
      throw new InvalidDirectiveError(
        "Types annotated with @workspaceAuth must also be annotated with @model."
      );
    }
  };


  private createWorkspaceAuthorizerResolver = (
    ctx: TransformerContext,
    ownershipModelName: string,
    userField: string,
    indexName: string,
    roleField: string,
    allowedRoles: string,
    relatedWorkspaceIDField: string,
    originalResolverId: string,
    typeName: string,
    fieldName: string,
    getFieldName: string,
  ) => {
    const fieldNameFirstletterUppercase =
      fieldName[0].toUpperCase() + fieldName.substring(1);

      const getFieldNameFirstletterUppercase =
      getFieldName[0].toUpperCase() + getFieldName.substring(1);

    // get already existing resolver
    const originalResolver = ctx.getResource(originalResolverId);
    if (!originalResolver.Properties) {
      throw new Error(
        "Could not find any properties in the generated resource."
      );
    }

    // build a pipeline function and copy the original data source and mapping templates
    const pipelineFunctionId = `${typeName}${fieldNameFirstletterUppercase}Function`;
    ctx.setResource(
      pipelineFunctionId,
      new AppSync.FunctionConfiguration({
        ApiId: Fn.GetAtt(
          ResourceConstants.RESOURCES.GraphQLAPILogicalID,
          "ApiId"
        ),
        DataSourceName: originalResolver.Properties.DataSourceName,
        FunctionVersion: "2018-05-29",
        Name: pipelineFunctionId,
        RequestMappingTemplate:print(
          compoundExpression([
            iff(
              str(`!$util.isNull($ctx.result) and !$util.isNull($ctx.result.${relatedWorkspaceIDField})`),
              qref(`$ctx.stash.put("workspaceID", $ctx.result.${relatedWorkspaceIDField})`)
            ),
            iff(
              str(`!$util.isNull($ctx.result) and !$util.isNullOrEmpty($ctx.result.items) and !$util.isNull($ctx.result.items[0].${relatedWorkspaceIDField})`),
              compoundExpression([
                qref(`$ctx.stash.put("workspaceID", $ctx.result.items[0].${relatedWorkspaceIDField})`),
                forEach(
                  ref('item'), 
                  ref('context.result.items'), 
                  [
                    iff(
                      str(`$ctx.stash.workspaceID != $item.${relatedWorkspaceIDField}`),
                      str('$util.unauthorized()')
                    )
                  ]
                ),
              ])
            ),
            str(originalResolver.Properties.RequestMappingTemplate),
          ])
        ),
        ResponseMappingTemplate:
          originalResolver.Properties.ResponseMappingTemplate,
      })
    );
    ctx.mapResourceToStack(WORKSPACE_AUTHORIZER_DIRECTIVE_STACK, pipelineFunctionId);


    // build a pipeline function to authorize request
    const authorizationpipelineFunctionId = "ValidateWorkspaceOwnershipFunction";
    if (!ctx.getResource(authorizationpipelineFunctionId)) {
      ctx.setResource(
        authorizationpipelineFunctionId,
        new AppSync.FunctionConfiguration({
          ApiId: Fn.GetAtt(
            ResourceConstants.RESOURCES.GraphQLAPILogicalID,
            "ApiId"
          ),
          DataSourceName: ModelResourceIDs.ModelTableResourceID(ownershipModelName),
          FunctionVersion: "2018-05-29",
          Name: authorizationpipelineFunctionId,
          RequestMappingTemplate: print(
            compoundExpression([
              DynamoDBMappingTemplate.query({
                query: obj({
                  expression: str('#userID = :userID and #workspaceID = :workspaceID'),
                  expressionNames: obj({
                    '#userID': str(userField),
                    '#workspaceID': str(relatedWorkspaceIDField),
                  }),
                  expressionValues: obj({
                    ':userID': obj({
                      S: str("${context.identity.username}"),
                    }),
                    ":workspaceID" : obj({
                      S: str("${context.stash.workspaceID}"),
                    })
                  }),
                }),
                scanIndexForward: bool(true),
                filter: nul(),
                limit: int(1),
                index: str(indexName)
              })
            ])
          ),
          ResponseMappingTemplate:print(
            compoundExpression([
              iff(str("$ctx.error"),str("$util.error($ctx.error.message, $ctx.error.type)")),
              iff(str(`$ctx.result.items and ($ctx.result.items.isEmpty() or !$ctx.stash.allowedRoles.contains($ctx.result.items[0].role))`),str('$util.unauthorized()')),
              str("$util.toJson($ctx.prev.result)"),
            ])
          ),
        })
      );
      ctx.mapResourceToStack(WORKSPACE_AUTHORIZER_DIRECTIVE_STACK, pipelineFunctionId);
    }


    // the @model directive does not finalize the resolver mappings directly but only in the
    // after() phase, which is executed after the firehose directive. Therefore we have to
    // finalize the resolvers ourselves to get the auto-generated ID as well as the create and
    // update dates in our DynamoDB pipeline function.
    const ddbMetata = ctx.metadata.get(DYNAMODB_METADATA_KEY);
    const hoistedContentGenerator =
      ddbMetata?.hoistedRequestMappingContent[originalResolverId];
    if (hoistedContentGenerator) {
      const hoistedContent = hoistedContentGenerator();
      if (hoistedContent) {
        const resource: AppSync.Resolver = ctx.getResource(
          pipelineFunctionId
        ) as any;
        resource.Properties.RequestMappingTemplate = [
          hoistedContent,
          resource.Properties.RequestMappingTemplate,
        ].join("\n");
        ctx.setResource(pipelineFunctionId, resource);
      }
    }

    // completely wipe out the original resolver to avoid circular dependencies between stacks
    if (ctx.template.Resources) {
      delete ctx.template.Resources[originalResolverId];
      ctx.getStackMapping().delete(originalResolverId);
      const ddbMetata = ctx.metadata.get(DYNAMODB_METADATA_KEY);
      if (ddbMetata?.hoistedRequestMappingContent) {
        delete ddbMetata.hoistedRequestMappingContent[originalResolverId];
      }
    }

    const pipelineDict:{ [key: string]: any } = {
      cre:  [
        Fn.GetAtt(authorizationpipelineFunctionId, "FunctionId"),
        Fn.GetAtt(pipelineFunctionId, "FunctionId"),
      ],
      upd:  [
        Fn.GetAtt(`Query${getFieldNameFirstletterUppercase}Function`, "FunctionId"),
        Fn.GetAtt(authorizationpipelineFunctionId, "FunctionId"),
        Fn.GetAtt(pipelineFunctionId, "FunctionId"),
      ],
      get:  [
        Fn.GetAtt(pipelineFunctionId, "FunctionId"),
        Fn.GetAtt(authorizationpipelineFunctionId, "FunctionId"),
        
      ],
      del:  [
        Fn.GetAtt(`Query${getFieldNameFirstletterUppercase}Function`, "FunctionId"),
        Fn.GetAtt(authorizationpipelineFunctionId, "FunctionId"),
        Fn.GetAtt(pipelineFunctionId, "FunctionId"),
      ],
      lis:  [
        Fn.GetAtt(pipelineFunctionId, "FunctionId"),
        Fn.GetAtt(authorizationpipelineFunctionId, "FunctionId"),
      ],
    }

    let pipelineDependsOn = [authorizationpipelineFunctionId, pipelineFunctionId]

    if(fieldName.substring(0,3) in ["upd", "del"]){
      pipelineDependsOn.push(`Query${getFieldNameFirstletterUppercase}Function`)
    }

    // create a new pipeline resolver and attach the pipeline functions
    const pipelineResolverId = `${typeName}${fieldNameFirstletterUppercase}PipelineResolver`;
    ctx.setResource(
      pipelineResolverId,
      new AppSync.Resolver({
        ApiId: Fn.GetAtt(
          ResourceConstants.RESOURCES.GraphQLAPILogicalID,
          "ApiId"
        ),
        TypeName: typeName,
        FieldName: fieldName,
        Kind: "PIPELINE",
        PipelineConfig: {
          Functions: pipelineDict[fieldName.substring(0,3)],
        },
        RequestMappingTemplate: printBlock("Stash resolver specific context.")(
          compoundExpression([
            iff(
              str(`!$util.isNull($ctx.args.input) and !$util.isNull($ctx.args.input.${relatedWorkspaceIDField})`),
              qref(`$ctx.stash.put("workspaceID", $ctx.args.input.${relatedWorkspaceIDField})`)
            ),
            iff(
              str(`!$util.isNull($ctx.args.input) and !$util.isNull($ctx.args.input.id)`),
              qref(`$ctx.args.put("id", $ctx.args.input.id)`)
            ),
            qref(`$ctx.stash.put("typeName", "${typeName}")`),
            qref(`$ctx.stash.put("fieldName", "${fieldName}")`),
            qref(`$ctx.stash.put("allowedRoles", ${JSON.stringify(allowedRoles)})`),
            obj({}),
          ])
        ),
        ResponseMappingTemplate: "$util.toJson($ctx.result)",
      }).dependsOn(pipelineDependsOn)
    );
    ctx.mapResourceToStack(WORKSPACE_AUTHORIZER_DIRECTIVE_STACK, pipelineResolverId);
  };
}
