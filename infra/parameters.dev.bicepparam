using 'main.bicep'

param location = 'eastus2'
param environment = 'dev'
param agentApiKey = '' // Set via --parameters at deploy time
param pingRegions = [
  'eastus'
  'westus2'
  'westeurope'
  'southeastasia'
  'australiaeast'
]
