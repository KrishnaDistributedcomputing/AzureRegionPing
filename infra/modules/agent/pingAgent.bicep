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

// ─── Function App (Consumption plan) ───────────────────────────────
resource agentPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-ping-${location}-plan'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  kind: 'functionapp'
}

resource agentFunc 'Microsoft.Web/sites@2023-12-01' = {
  name: '${prefix}-ping-${location}-func'
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: agentPlan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~20'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${agentStorage.name};AccountKey=${agentStorage.listKeys().keys[0].value}' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'AGENT_API_KEY', value: agentApiKey }
        { name: 'REGION_ID', value: location }
      ]
    }
  }
}

output agentUrl string = 'https://${agentFunc.properties.defaultHostName}'
output agentName string = agentFunc.name
