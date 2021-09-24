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
  and,
  iff,
  int,
  not,
  or,
  forEach,
  bool,
  ifElse,
  isNullOrEmpty,
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


export class WorkspaceAuthorizerTransformer extends Transformer {
  constructor() {
    super(
      "WorkspaceAuthorizerTransformer",
      gql`
        directive @workspaceAuth(ownershipModelName: String, userField: String, indexName: String, roleField: String, allowedRoles: [String], relatedWorkspaceIDField: String) on OBJECT
      `
    );
  }

  public object = (
    definition: ObjectTypeDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    this.validateObject(definition);

    const { ownershipModelName="Ownership", userField="userID", indexName="byUser", roleField="role", allowedRoles=["editor", "admin", "owner"], relatedWorkspaceIDField="companyID" } = getDirectiveArguments(directive);

    
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
      `list${plurality(definition.name.value, true)}`,
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

       // build a pipeline function to authorize request
       const authorizationpipelineFunctionId = "ValidateWorkspaceOwnershipFunction";
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
               iff(ref('ctx.error'),ref('util.error($ctx.error.message, $ctx.error.type)')),
               iff(and([not(ref('util.isNull($ctx.stash.workspaceID')),or([isNullOrEmpty(ref('ctx.result.items')), ref('ctx.result.items.isEmpty()'), not(ref(`ctx.stash.allowedRoles.contains($ctx.result.items[0].${roleField})`))])]),ref('util.unauthorized()')),
               ref("util.toJson($ctx.prev.result)"),
             ])
           ),
         })
       );
       ctx.mapResourceToStack(WORKSPACE_AUTHORIZER_DIRECTIVE_STACK, authorizationpipelineFunctionId);
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
        RequestMappingTemplate: originalResolver.Properties.RequestMappingTemplate,
        ResponseMappingTemplate:
        print(
          compoundExpression([
            iff(
              and([not(ref(`util.isNull($ctx.result)`)), not(ref(`util.isNull($ctx.result.${relatedWorkspaceIDField})`))]),
              qref(`$ctx.stash.put("workspaceID", $ctx.result.${relatedWorkspaceIDField})`)
            ),
            iff(
              and([not(ref(`util.isNull($ctx.result)`)), not(ref(`util.isNullOrEmpty($ctx.result.items)`)), not(ref(`ctx.result.items.isEmpty()`))]),
              compoundExpression([
                qref(`$ctx.stash.put("workspaceID", $ctx.result.items[0].${relatedWorkspaceIDField})`),
                forEach(
                  ref('item'), 
                  ref('context.result.items'), 
                  [
                    iff(
                      ref(`ctx.stash.workspaceID != $item.${relatedWorkspaceIDField}`),
                      ref('util.unauthorized()')
                    )
                  ]
                ),
              ])
            ),
            raw(originalResolver.Properties.ResponseMappingTemplate),
          ])
        ),
      })
    );
    ctx.mapResourceToStack(WORKSPACE_AUTHORIZER_DIRECTIVE_STACK, pipelineFunctionId);


    // the @model directive does not finalize the resolver mappings directly but only in the
    // after() phase, which is executed after the workspaceAuth directive. Therefore we have to
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
              and([not(ref(`util.isNull($ctx.args.input)`)),  not(ref(`util.isNull($ctx.args.input.${relatedWorkspaceIDField})`))]),
              qref(`$ctx.stash.put("workspaceID", $ctx.args.input.${relatedWorkspaceIDField})`)
            ),
            iff(
              and([not(ref(`util.isNull($ctx.args.input)`)), not(ref(`util.isNull($ctx.args.input.id)`))]),
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
