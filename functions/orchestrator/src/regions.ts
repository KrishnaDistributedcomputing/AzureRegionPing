/** Region registry — maps region IDs to their agent URLs and metadata */

export interface RegionConfig {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  agentUrl: string;
  enabled: boolean;
}

/**
 * Returns list of regions. In production, agentUrl comes from Cosmos DB or App Config.
 * For now, derived from the naming convention: func-ping-{regionId}.azurewebsites.net
 */
export function getRegions(): RegionConfig[] {
  const baseUrlPattern = process.env.AGENT_URL_PATTERN || 'https://func-ping-{region}.azurewebsites.net';

  return REGIONS.map((r) => ({
    ...r,
    agentUrl: baseUrlPattern.replace('{region}', r.id),
  }));
}

export function getRegionById(id: string): RegionConfig | undefined {
  return getRegions().find((r) => r.id === id);
}

const REGIONS: Omit<RegionConfig, 'agentUrl'>[] = [
  { id: 'eastus', displayName: 'East US', lat: 37.3719, lng: -79.8164, enabled: true },
  { id: 'eastus2', displayName: 'East US 2', lat: 36.6681, lng: -78.3889, enabled: true },
  { id: 'westus', displayName: 'West US', lat: 37.783, lng: -122.417, enabled: true },
  { id: 'westus2', displayName: 'West US 2', lat: 47.233, lng: -119.852, enabled: true },
  { id: 'westus3', displayName: 'West US 3', lat: 33.448, lng: -112.074, enabled: true },
  { id: 'centralus', displayName: 'Central US', lat: 41.5908, lng: -93.6208, enabled: true },
  { id: 'northcentralus', displayName: 'North Central US', lat: 41.8819, lng: -87.6278, enabled: true },
  { id: 'southcentralus', displayName: 'South Central US', lat: 29.4167, lng: -98.5, enabled: true },
  { id: 'canadacentral', displayName: 'Canada Central', lat: 43.653, lng: -79.383, enabled: true },
  { id: 'brazilsouth', displayName: 'Brazil South', lat: -23.55, lng: -46.633, enabled: true },
  { id: 'northeurope', displayName: 'North Europe', lat: 53.3478, lng: -6.2597, enabled: true },
  { id: 'westeurope', displayName: 'West Europe', lat: 52.3667, lng: 4.9, enabled: true },
  { id: 'uksouth', displayName: 'UK South', lat: 51.5074, lng: -0.1278, enabled: true },
  { id: 'francecentral', displayName: 'France Central', lat: 46.3772, lng: 2.373, enabled: true },
  { id: 'germanywestcentral', displayName: 'Germany West Central', lat: 50.1109, lng: 8.6821, enabled: true },
  { id: 'swedencentral', displayName: 'Sweden Central', lat: 60.6749, lng: 17.1413, enabled: true },
  { id: 'norwayeast', displayName: 'Norway East', lat: 59.9139, lng: 10.7522, enabled: true },
  { id: 'southeastasia', displayName: 'Southeast Asia', lat: 1.2834, lng: 103.8607, enabled: true },
  { id: 'eastasia', displayName: 'East Asia', lat: 22.267, lng: 114.188, enabled: true },
  { id: 'japaneast', displayName: 'Japan East', lat: 35.68, lng: 139.77, enabled: true },
  { id: 'koreacentral', displayName: 'Korea Central', lat: 37.5665, lng: 126.978, enabled: true },
  { id: 'australiaeast', displayName: 'Australia East', lat: -33.86, lng: 151.2094, enabled: true },
  { id: 'centralindia', displayName: 'Central India', lat: 18.5204, lng: 73.8567, enabled: true },
  { id: 'uaenorth', displayName: 'UAE North', lat: 25.2048, lng: 55.2708, enabled: true },
  { id: 'southafricanorth', displayName: 'South Africa North', lat: -26.2041, lng: 28.0473, enabled: true },
];
