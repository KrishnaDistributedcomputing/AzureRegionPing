@description('Azure region to deploy this ping agent')
param location string

@description('Resource name prefix')
param prefix string

@description('App Insights connection string from core deployment')
param appInsightsConnectionString string

@secure()
@description('API key for agent authentication')
param agentApiKey string

// ─── Storage Account (Function state) ──────────────────────────────
resource agentStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace('${prefix}ping${location}', '-', '')
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// ─── Function App (Flex Consumption plan) ──────────────────────────
resource agentPlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${prefix}-ping-${location}-plan'
  location: location
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  kind: 'functionapp,linux'
  properties: {
    reserved: true
  }
}

resource agentFunc 'Microsoft.Web/sites@2024-04-01' = {
  name: '${prefix}-ping-${location}-func'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: agentPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${agentStorage.properties.primaryEndpoints.blob}deploymentpackages'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'AzureWebJobsStorage'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '20'
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 10
        instanceMemoryMB: 2048
      }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${agentStorage.name};AccountKey=${agentStorage.listKeys().keys[0].value}' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'AGENT_API_KEY', value: agentApiKey }
        { name: 'REGION_ID', value: location }
      ]
    }
  }
}

output agentUrl string = 'https://${agentFunc.properties.defaultHostName}'
output agentName string = agentFunc.name
