targetScope = 'subscription'

@description('Primary deployment region for core resources')
param location string = 'eastus2'

@description('Environment name')
@allowed(['dev', 'prod'])
param environment string = 'dev'

@description('Azure regions to deploy ping agents')
param pingRegions array = [
  'eastus'
  'eastus2'
  'westus'
  'westus2'
  'westus3'
  'centralus'
  'northcentralus'
  'southcentralus'
  'canadacentral'
  'brazilsouth'
  'northeurope'
  'westeurope'
  'uksouth'
  'francecentral'
  'germanywestcentral'
  'swedencentral'
  'norwayeast'
  'southeastasia'
  'eastasia'
  'japaneast'
  'koreacentral'
  'australiaeast'
  'centralindia'
  'uaenorth'
  'southafricanorth'
]

@secure()
@description('API key for agent-to-agent authentication')
param agentApiKey string

var prefix = 'arp-${environment}'

// Core resource group
resource rgCore 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-${prefix}-core'
  location: location
}

// Deploy core resources
module core 'modules/core/main.bicep' = {
  name: 'deploy-core'
  scope: rgCore
  params: {
    location: location
    prefix: prefix
    agentApiKey: agentApiKey
  }
}

// Deploy ping agents to each region
module pingAgents 'modules/agent/pingAgent.bicep' = [for region in pingRegions: {
  name: 'deploy-agent-${region}'
  scope: rgCore
  params: {
    location: region
    prefix: prefix
    appInsightsConnectionString: core.outputs.appInsightsConnectionString
    agentApiKey: agentApiKey
  }
}]
