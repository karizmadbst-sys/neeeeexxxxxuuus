import type { BuildingSpec, BuildingStyle, MapAreaLabel, RoadSegmentSpec } from './MapData';

export interface MapNeighborhoodExpansion {
  roads: readonly RoadSegmentSpec[];
  areas: readonly MapAreaLabel[];
  buildings: readonly BuildingSpec[];
}

interface HouseBlueprint {
  id: string;
  name: string;
  areaName: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotationY: number;
  style: BuildingStyle;
  wallColorHex: string;
  roofColorHex: string;
  accentColorHex: string;
}

function toBuildingSpec(bp: HouseBlueprint): BuildingSpec {
  const isThreeStory = bp.style === 'apartment_block' || bp.style === 'residential_complex';
  const isOneStory = bp.style === 'village_home';
  return {
    id: bp.id,
    name: bp.name,
    areaName: bp.areaName,
    x: bp.x,
    z: bp.z,
    width: bp.width,
    height: isThreeStory ? 11.9 : isOneStory ? 4.2 : 8.0,
    depth: bp.depth,
    rotationY: bp.rotationY,
    style: bp.style,
    ...(isThreeStory ? { floors: 3 } : {}),
    wallColorHex: bp.wallColorHex,
    roofColorHex: bp.roofColorHex,
    accentColorHex: bp.accentColorHex,
    placeholderModelKey: bp.id,
  };
}

function buildCluster(items: readonly HouseBlueprint[]): BuildingSpec[] {
  return items.map(toBuildingSpec);
}

export const DESERT_EXPANSION: MapNeighborhoodExpansion = {
  roads: [
    { id: 'd-nbr-nw-lane', startX: -225, startZ: -76, endX: 0, endZ: -76, width: 4.6 },
    { id: 'd-nbr-ne-lane', startX: 0, startZ: -76, endX: 225, endZ: -76, width: 4.6 },
    { id: 'd-nbr-se-lane', startX: 0, startZ: 76, endX: 225, endZ: 76, width: 4.6 },
    { id: 'd-nbr-sw-lane', startX: -225, startZ: 76, endX: 0, endZ: 76, width: 4.6 },
    { id: 'd-nbr-n-mid', startX: -180, startZ: -174, endX: 180, endZ: -174, width: 4.5 },
    { id: 'd-nbr-sw-outer', startX: -320, startZ: 365, endX: -110, endZ: 365, width: 4.6 },
    { id: 'd-nbr-se-outer', startX: 110, startZ: 365, endX: 320, endZ: 365, width: 4.6 },
    { id: 'd-nbr-ne-outer', startX: 110, startZ: -392, endX: 320, endZ: -392, width: 4.6 },
    { id: 'd-nbr-nw-outer', startX: -375, startZ: -388, endX: -210, endZ: -388, width: 4.6 },
    { id: 'd-nbr-s-mid-w', startX: -210, startZ: 186, endX: -28, endZ: 186, width: 4.5 },
    { id: 'd-nbr-s-mid-e', startX: 28, startZ: 186, endX: 210, endZ: 186, width: 4.5 },
    { id: 'd-nbr-w-way', startX: -476, startZ: -175, endX: -476, endZ: 175, width: 4.6 },
    { id: 'd-nbr-e-way', startX: 476, startZ: -175, endX: 476, endZ: 175, width: 4.6 },
    { id: 'd-nbr-s-suburb', startX: -235, startZ: 452, endX: 235, endZ: 452, width: 4.6 },
    { id: 'd-nbr-n-frontier', startX: -235, startZ: -456, endX: 235, endZ: -456, width: 4.6 },
  ],
  areas: [
    { name: 'DUNEVIEW VILLAGE', x: -120, z: -76, kind: 'village' },
    { name: 'PALMWOOD COURT', x: 120, z: -76, kind: 'residential' },
    { name: 'COPPERLINE DISTRICT', x: 120, z: 76, kind: 'residential' },
    { name: 'TUMBLEWEED HAMLET', x: -120, z: 76, kind: 'village' },
    { name: 'WADI RUIN HOMES', x: -215, z: 365, kind: 'village' },
    { name: 'SOLSTICE ESTATES', x: 220, z: 365, kind: 'residential' },
    { name: 'HELIOS GARDENS', x: 215, z: -392, kind: 'residential' },
    { name: 'CANYONGATE VILLAGE', x: -292, z: -388, kind: 'village' },
    { name: 'SUNCREST TERRACE', x: 0, z: 186, kind: 'residential' },
    { name: 'WESTERN CANYON WAY', x: -476, z: 0, kind: 'village' },
    { name: 'EASTERN DUNE WAY', x: 476, z: 0, kind: 'village' },
    { name: 'SOUTH DUNES SUBURB', x: 0, z: 452, kind: 'residential' },
    { name: 'NORTHERN FRONTIER', x: 0, z: -456, kind: 'residential' },
  ],
  buildings: buildCluster([
    // 1. Duneview Village (NW belt along z = -76)
    { id: 'd-x-nw-1', name: 'Duneview Adobe Home', areaName: 'Duneview Village', x: -190, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-nw-2', name: 'Clay Courtyard House', areaName: 'Duneview Village', x: -152, z: -56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#38bdf8' },
    { id: 'd-x-nw-3', name: 'Sandswept Cottage', areaName: 'Duneview Village', x: -112, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-nw-4', name: 'Old Caravan Rest', areaName: 'Duneview Village', x: -72, z: -56, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-nw-5', name: 'Duneview Townhouse', areaName: 'Duneview Village', x: -190, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#875736', accentColorHex: '#fbbf24' },
    { id: 'd-x-nw-6', name: 'Sandstone Villa', areaName: 'Duneview Village', x: -148, z: -98, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-nw-7', name: 'Weathered Adobe', areaName: 'Duneview Village', x: -108, z: -98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#cca57b', roofColorHex: '#734a2c', accentColorHex: '#f97316' },
    { id: 'd-x-nw-8', name: 'Bazaar Gate House', areaName: 'Duneview Village', x: -42, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d9b589', roofColorHex: '#854d0e', accentColorHex: '#fbbf24' },

    // 2. Palmwood Court (NE belt along z = -76)
    { id: 'd-x-ne-1', name: 'Palmwood Duplex', areaName: 'Palmwood Court', x: 46, z: -56, width: 21.8, depth: 16.8, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#7c4d2d', accentColorHex: '#38bdf8' },
    { id: 'd-x-ne-2', name: 'Oasis Villa East', areaName: 'Palmwood Court', x: 92, z: -56, width: 22.5, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#f0dfc7', roofColorHex: '#a16207', accentColorHex: '#fbbf24' },
    { id: 'd-x-ne-3', name: 'Palmwood Cottage', areaName: 'Palmwood Court', x: 148, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f97316' },
    { id: 'd-x-ne-4', name: 'Mirage Residence', areaName: 'Palmwood Court', x: 188, z: -56, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-ne-5', name: 'Suncrest Manor', areaName: 'Palmwood Court', x: 42, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#dfc29a', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-ne-6', name: 'Abandoned Mudbrick', areaName: 'Palmwood Court', x: 100, z: -98, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b39476', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },
    { id: 'd-x-ne-7', name: 'Saffron Bungalow', areaName: 'Palmwood Court', x: 152, z: -98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#e4caa5', roofColorHex: '#92400e', accentColorHex: '#f59e0b' },
    { id: 'd-x-ne-8', name: 'Eastwatch Manor', areaName: 'Palmwood Court', x: 190, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d2aa7d', roofColorHex: '#784e2e', accentColorHex: '#fb923c' },

    // 3. Copperline District (SE belt along z = 76)
    { id: 'd-x-se-1', name: 'Copperline House', areaName: 'Copperline District', x: 46, z: 56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d6b288', roofColorHex: '#825332', accentColorHex: '#f97316' },
    { id: 'd-x-se-2', name: 'Forge View Apartment', areaName: 'Copperline District', x: 96, z: 56, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c9a074', roofColorHex: '#634229', accentColorHex: '#fbbf24' },
    { id: 'd-x-se-3', name: 'Copperline Cottage', areaName: 'Copperline District', x: 150, z: 56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e3c7a2', roofColorHex: '#8d5b34', accentColorHex: '#38bdf8' },
    { id: 'd-x-se-4', name: 'Modern Trade Complex', areaName: 'Copperline District', x: 188, z: 56, width: 22.3, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d8ba93', roofColorHex: '#524034', accentColorHex: '#22d3ee' },
    { id: 'd-x-se-5', name: 'Southwind Residence', areaName: 'Copperline District', x: 104, z: 98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#dfc198', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-se-6', name: 'Weathered Storehouse', areaName: 'Copperline District', x: 148, z: 98, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#a98c6f', roofColorHex: '#5a4332', accentColorHex: '#2dd4bf' },
    { id: 'd-x-se-7', name: 'Terracotta Home', areaName: 'Copperline District', x: 188, z: 98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#d8ad80', roofColorHex: '#9a3412', accentColorHex: '#fb923c' },
    { id: 'd-x-se-8', name: 'Copperline Garage', areaName: 'Copperline District', x: 46, z: 98, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#998370', roofColorHex: '#4f3f33', accentColorHex: '#38bdf8' },

    // 4. Tumbleweed Hamlet (SW belt along z = 76)
    { id: 'd-x-sw-1', name: 'Tumbleweed Shack', areaName: 'Tumbleweed Hamlet', x: -190, z: 56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#d9b58b', roofColorHex: '#7d5233', accentColorHex: '#f59e0b' },
    { id: 'd-x-sw-2', name: 'Old Adobe Ruins', areaName: 'Tumbleweed Hamlet', x: -152, z: 56, width: 18.8, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b49577', roofColorHex: '#634732', accentColorHex: '#2dd4bf' },
    { id: 'd-x-sw-3', name: 'Sunset Hearth', areaName: 'Tumbleweed Hamlet', x: -112, z: 56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#e2c49e', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-sw-4', name: 'Drybed Villa', areaName: 'Tumbleweed Hamlet', x: -64, z: 56, width: 22.0, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#ece0cc', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-sw-5', name: 'Tumbleweed Barn', areaName: 'Tumbleweed Hamlet', x: -190, z: 98, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#9e8974', roofColorHex: '#574537', accentColorHex: '#f97316' },
    { id: 'd-x-sw-6', name: 'Nomad Mudhouse', areaName: 'Tumbleweed Hamlet', x: -150, z: 98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#cfa67a', roofColorHex: '#734b2e', accentColorHex: '#fbbf24' },
    { id: 'd-x-sw-7', name: 'Worn Desert Flats', areaName: 'Tumbleweed Hamlet', x: -102, z: 98, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#d3ad82', roofColorHex: '#6e492e', accentColorHex: '#38bdf8' },
    { id: 'd-x-sw-8', name: 'Sandstone Ruin', areaName: 'Tumbleweed Hamlet', x: -56, z: 98, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#ab8f74', roofColorHex: '#5a4332', accentColorHex: '#2dd4bf' },

    // 5. Inner-Ring North Terrace (along z = -174)
    { id: 'd-x-nm-1', name: 'North Terrace House', areaName: 'Duneview Village', x: -150, z: -154, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-nm-2', name: 'North Terrace Cottage', areaName: 'Duneview Village', x: -112, z: -154, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#7c4d2d', accentColorHex: '#f59e0b' },
    { id: 'd-x-nm-3', name: 'North Terrace Ruins', areaName: 'Duneview Village', x: -42, z: -154, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b29477', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },
    { id: 'd-x-nm-4', name: 'North Terrace Villa', areaName: 'Palmwood Court', x: 46, z: -154, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eedec5', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-nm-5', name: 'North Terrace Duplex', areaName: 'Palmwood Court', x: 98, z: -154, width: 21.8, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d9b589', roofColorHex: '#6e492e', accentColorHex: '#22d3ee' },
    { id: 'd-x-nm-6', name: 'North Terrace Flats', areaName: 'Palmwood Court', x: 148, z: -154, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#634229', accentColorHex: '#fbbf24' },

    // 6. Wadi Ruin Homes (SW outer settlement along z = 365)
    { id: 'd-x-swo-1', name: 'Wadi Ruin North', areaName: 'Wadi Ruin Homes', x: -306, z: 342, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#ad9074', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },
    { id: 'd-x-swo-2', name: 'Wadi Mud Cottage', areaName: 'Wadi Ruin Homes', x: -272, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#d8b48a', roofColorHex: '#805334', accentColorHex: '#f59e0b' },
    { id: 'd-x-swo-3', name: 'Wadi Family House', areaName: 'Wadi Ruin Homes', x: -244, z: 342, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#dfc19a', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-swo-4', name: 'Wadi Terrace Blocks', areaName: 'Wadi Ruin Homes', x: -178, z: 342, width: 21.8, depth: 17.2, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cca276', roofColorHex: '#63422a', accentColorHex: '#38bdf8' },
    { id: 'd-x-swo-5', name: 'Wadi Gate Cottage', areaName: 'Wadi Ruin Homes', x: -136, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e3c8a4', roofColorHex: '#8d5b34', accentColorHex: '#fb923c' },
    { id: 'd-x-swo-6', name: 'Southern Ruined Villa', areaName: 'Wadi Ruin Homes', x: -292, z: 390, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#e6d3b6', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-swo-7', name: 'Wadi Small Dwelling', areaName: 'Wadi Ruin Homes', x: -252, z: 390, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#cfa67a', roofColorHex: '#734b2e', accentColorHex: '#f59e0b' },
    { id: 'd-x-swo-8', name: 'Wadi Desert Ruins', areaName: 'Wadi Ruin Homes', x: -214, z: 390, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b29477', roofColorHex: '#604632', accentColorHex: '#2dd4bf' },
    { id: 'd-x-swo-9', name: 'Wadi Residence', areaName: 'Wadi Ruin Homes', x: -172, z: 390, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#854d0e', accentColorHex: '#fbbf24' },
    { id: 'd-x-swo-10', name: 'Wadi Storage Barn', areaName: 'Wadi Ruin Homes', x: -130, z: 390, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#98826e', roofColorHex: '#4f3f33', accentColorHex: '#f97316' },

    // 7. Solstice Estates (SE outer neighborhood along z = 365, clear of d-obs-18 at (145, 405))
    { id: 'd-x-seo-1', name: 'Solstice Entry Villa', areaName: 'Solstice Estates', x: 142, z: 342, width: 22.3, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eedec5', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-seo-2', name: 'Solstice Modern Suites', areaName: 'Solstice Estates', x: 184, z: 342, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#dfd3c3', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-seo-3', name: 'Solstice Cottage West', areaName: 'Solstice Estates', x: 242, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f97316' },
    { id: 'd-x-seo-4', name: 'Solstice Townhouse', areaName: 'Solstice Estates', x: 274, z: 342, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d3ae82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-seo-5', name: 'Solstice Tech Outpost', areaName: 'Solstice Estates', x: 306, z: 342, width: 20.3, depth: 16.1, rotationY: Math.PI, style: 'cyber_outpost', wallColorHex: '#b8aa99', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'd-x-seo-6', name: 'Solstice Highrise', areaName: 'Solstice Estates', x: 182, z: 390, width: 21.8, depth: 17.2, rotationY: 0, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#634229', accentColorHex: '#fbbf24' },
    { id: 'd-x-seo-7', name: 'Solstice Ruined Home', areaName: 'Solstice Estates', x: 224, z: 390, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#ae9175', roofColorHex: '#5c4432', accentColorHex: '#2dd4bf' },
    { id: 'd-x-seo-8', name: 'Solstice Cottage East', areaName: 'Solstice Estates', x: 262, z: 390, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#e3c8a4', roofColorHex: '#8d5b34', accentColorHex: '#fb923c' },
    { id: 'd-x-seo-9', name: 'Solstice Courtyard', areaName: 'Solstice Estates', x: 300, z: 390, width: 20.9, depth: 16.6, rotationY: 0, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#854d0e', accentColorHex: '#38bdf8' },

    // 8. Helios Gardens (NE outer neighborhood along z = -392, clear of d-villa-7 at (255, -356))
    { id: 'd-x-neo-1', name: 'Helios Research Home', areaName: 'Helios Gardens', x: 140, z: -368, width: 20.4, depth: 16.4, rotationY: Math.PI, style: 'futuristic_lab', wallColorHex: '#dcd3c7', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 'd-x-neo-2', name: 'Helios Complex West', areaName: 'Helios Gardens', x: 186, z: -368, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#e1ccb1', roofColorHex: '#475569', accentColorHex: '#38bdf8' },
    { id: 'd-x-neo-3', name: 'Helios Manor House', areaName: 'Helios Gardens', x: 302, z: -368, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-neo-4', name: 'Helios Villa North', areaName: 'Helios Gardens', x: 140, z: -416, width: 22.3, depth: 16.9, rotationY: 0, style: 'luxury_villa', wallColorHex: '#efe0c8', roofColorHex: '#9a3412', accentColorHex: '#fbbf24' },
    { id: 'd-x-neo-5', name: 'Helios Towers', areaName: 'Helios Gardens', x: 186, z: -416, width: 21.8, depth: 17.2, rotationY: 0, style: 'apartment_block', wallColorHex: '#cca276', roofColorHex: '#634229', accentColorHex: '#38bdf8' },
    { id: 'd-x-neo-6', name: 'Helios Ruined Lodge', areaName: 'Helios Gardens', x: 228, z: -416, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b29477', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },
    { id: 'd-x-neo-7', name: 'Helios Cottage B', areaName: 'Helios Gardens', x: 268, z: -416, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#e3c8a4', roofColorHex: '#8d5b34', accentColorHex: '#fb923c' },

    // 9. Open-World Homesteads & Outposts
    { id: 'd-x-open-1', name: 'West Ridge Homestead', areaName: 'Canyon Refinery', x: -455, z: -95, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#7d5233', accentColorHex: '#f59e0b' },
    { id: 'd-x-open-2', name: 'Canyon Ruin Shack', areaName: 'Canyon Refinery', x: -455, z: 95, width: 18.6, depth: 15.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#ae9175', roofColorHex: '#5c4432', accentColorHex: '#2dd4bf' },
    { id: 'd-x-open-3', name: 'Dustbowl Farmstead', areaName: 'Dustbowl Hamlet', x: 455, z: -95, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#dfc19a', roofColorHex: '#854d0e', accentColorHex: '#fbbf24' },
    { id: 'd-x-open-4', name: 'East Dune Cottage', areaName: 'Dustbowl Hamlet', x: 455, z: 95, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#e4caa6', roofColorHex: '#8d5b34', accentColorHex: '#f97316' },
    { id: 'd-x-open-5', name: 'NW Overlook Ruin', areaName: 'Sunstone Metropolis', x: -375, z: -345, width: 19.0, depth: 15.5, rotationY: 0.42, style: 'abandoned_building', wallColorHex: '#b19376', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },
    { id: 'd-x-open-6', name: 'SE Canyon Outpost', areaName: 'Sunken Ruins', x: 435, z: 255, width: 20.6, depth: 16.6, rotationY: -0.35, style: 'cyber_outpost', wallColorHex: '#b6a897', roofColorHex: '#334155', accentColorHex: '#38bdf8' },

    // 10. Canyongate Village (NW outer along z = -388)
    { id: 'd-x-cyn-1', name: 'Canyongate Adobe A', areaName: 'Canyongate Village', x: -336, z: -404, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-cyn-2', name: 'Canyongate Manor', areaName: 'Canyongate Village', x: -302, z: -408, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-cyn-3', name: 'Canyongate Villa', areaName: 'Canyongate Village', x: -270, z: -408, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-cyn-4', name: 'Canyongate Flats', areaName: 'Canyongate Village', x: -225, z: -408, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-cyn-5', name: 'Canyongate Ruin', areaName: 'Canyongate Village', x: -340, z: -366, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-cyn-6', name: 'Canyongate Cottage B', areaName: 'Canyongate Village', x: -302, z: -366, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },

    // 11. Suncrest Terrace (Mid-South neighborhood along z = 186)
    { id: 'd-x-sun-1', name: 'Suncrest Cottage W', areaName: 'Suncrest Terrace', x: -190, z: 165, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-sun-2', name: 'Suncrest Residence', areaName: 'Suncrest Terrace', x: -150, z: 165, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-sun-3', name: 'Suncrest Villas West', areaName: 'Suncrest Terrace', x: -105, z: 165, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-sun-4', name: 'Suncrest Ruined Inn', areaName: 'Suncrest Terrace', x: -55, z: 165, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-sun-5', name: 'Suncrest Modern E1', areaName: 'Suncrest Terrace', x: 52, z: 165, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-sun-6', name: 'Suncrest Bungalow E', areaName: 'Suncrest Terrace', x: 112, z: 165, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f97316' },
    { id: 'd-x-sun-7', name: 'Suncrest Townhouse E', areaName: 'Suncrest Terrace', x: 152, z: 165, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#dfc29a', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-sun-8', name: 'Suncrest Tower E', areaName: 'Suncrest Terrace', x: 192, z: 165, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-sun-9', name: 'Suncrest S-West Home', areaName: 'Suncrest Terrace', x: -190, z: 204, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-sun-10', name: 'Suncrest S-Mid Flats', areaName: 'Suncrest Terrace', x: -148, z: 204, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-sun-11', name: 'Suncrest S-Inner House', areaName: 'Suncrest Terrace', x: -104, z: 204, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#875736', accentColorHex: '#fbbf24' },
    { id: 'd-x-sun-12', name: 'Suncrest S-East Villa', areaName: 'Suncrest Terrace', x: 96, z: 204, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#f0dfc7', roofColorHex: '#a16207', accentColorHex: '#38bdf8' },
    { id: 'd-x-sun-13', name: 'Suncrest S-East Cottage', areaName: 'Suncrest Terrace', x: 148, z: 204, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f59e0b' },
    { id: 'd-x-sun-14', name: 'Suncrest S-East Ruin', areaName: 'Suncrest Terrace', x: 188, z: 204, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b39476', roofColorHex: '#5e4532', accentColorHex: '#2dd4bf' },

    // 12. Western Canyon Way (along x = -476)
    { id: 'd-x-wcw-1', name: 'Canyon Way Cottage 1', areaName: 'Western Canyon Way', x: -496, z: -148, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-wcw-2', name: 'Canyon Way Manor 1', areaName: 'Western Canyon Way', x: -496, z: -108, width: 20.6, depth: 16.4, rotationY: Math.PI * 0.5, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-wcw-3', name: 'Canyon Way Ruin 1', areaName: 'Western Canyon Way', x: -496, z: -68, width: 18.6, depth: 15.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-wcw-4', name: 'Canyon Way Villa 1', areaName: 'Western Canyon Way', x: -496, z: -26, width: 22.0, depth: 16.8, rotationY: Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-wcw-5', name: 'Canyon Way Complex 1', areaName: 'Western Canyon Way', x: -496, z: 26, width: 21.8, depth: 16.8, rotationY: Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-wcw-6', name: 'Canyon Way Cottage 2', areaName: 'Western Canyon Way', x: -496, z: 68, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-wcw-7', name: 'Canyon Way Flats', areaName: 'Western Canyon Way', x: -496, z: 110, width: 21.6, depth: 16.8, rotationY: Math.PI * 0.5, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-wcw-8', name: 'Canyon Way Barn', areaName: 'Western Canyon Way', x: -454, z: -145, width: 21.0, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'warehouse', wallColorHex: '#9c8672', roofColorHex: '#5c493a', accentColorHex: '#38bdf8' },
    { id: 'd-x-wcw-9', name: 'Canyon Way Adobe E', areaName: 'Western Canyon Way', x: -454, z: -45, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f97316' },
    { id: 'd-x-wcw-10', name: 'Canyon Way House E', areaName: 'Western Canyon Way', x: -454, z: 45, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#dfc29a', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-wcw-11', name: 'Canyon Way Outpost E', areaName: 'Western Canyon Way', x: -454, z: 145, width: 19.8, depth: 15.6, rotationY: -Math.PI * 0.5, style: 'cyber_outpost', wallColorHex: '#b6a897', roofColorHex: '#334155', accentColorHex: '#38bdf8' },

    // 13. Eastern Dune Way (along x = 476)
    { id: 'd-x-edw-1', name: 'Dune Way Cottage 1', areaName: 'Eastern Dune Way', x: 496, z: -148, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-edw-2', name: 'Dune Way Manor 1', areaName: 'Eastern Dune Way', x: 496, z: -108, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-edw-3', name: 'Dune Way Flats', areaName: 'Eastern Dune Way', x: 496, z: -66, width: 21.6, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-edw-4', name: 'Dune Way Villa 1', areaName: 'Eastern Dune Way', x: 496, z: -24, width: 22.0, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-edw-5', name: 'Dune Way Ruin 1', areaName: 'Eastern Dune Way', x: 496, z: 24, width: 18.6, depth: 15.0, rotationY: -Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-edw-6', name: 'Dune Way Cottage 2', areaName: 'Eastern Dune Way', x: 496, z: 68, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-edw-7', name: 'Dune Way Complex', areaName: 'Eastern Dune Way', x: 496, z: 110, width: 21.8, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-edw-8', name: 'Dune Way Garage W', areaName: 'Eastern Dune Way', x: 454, z: -145, width: 21.0, depth: 16.4, rotationY: Math.PI * 0.5, style: 'warehouse', wallColorHex: '#9c8672', roofColorHex: '#5c493a', accentColorHex: '#38bdf8' },
    { id: 'd-x-edw-9', name: 'Dune Way Adobe W', areaName: 'Eastern Dune Way', x: 454, z: -45, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f97316' },
    { id: 'd-x-edw-10', name: 'Dune Way House W', areaName: 'Eastern Dune Way', x: 454, z: 45, width: 20.6, depth: 16.4, rotationY: Math.PI * 0.5, style: 'huge_house', wallColorHex: '#dfc29a', roofColorHex: '#8d5b34', accentColorHex: '#fbbf24' },
    { id: 'd-x-edw-11', name: 'Dune Way Lab W', areaName: 'Eastern Dune Way', x: 454, z: 145, width: 20.4, depth: 16.4, rotationY: Math.PI * 0.5, style: 'futuristic_lab', wallColorHex: '#dcd3c7', roofColorHex: '#334155', accentColorHex: '#22d3ee' },

    // 14. South Dunes Suburb (along z = 452)
    { id: 'd-x-sds-1', name: 'South Dunes Cottage 1', areaName: 'South Dunes Suburb', x: -210, z: 432, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-sds-2', name: 'South Dunes House 1', areaName: 'South Dunes Suburb', x: -168, z: 432, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-sds-3', name: 'South Dunes Ruin 1', areaName: 'South Dunes Suburb', x: -124, z: 432, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-sds-4', name: 'South Dunes Villa W', areaName: 'South Dunes Suburb', x: -80, z: 432, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-sds-5', name: 'South Dunes Cottage 2', areaName: 'South Dunes Suburb', x: -35, z: 432, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-sds-6', name: 'South Dunes Complex E', areaName: 'South Dunes Suburb', x: 42, z: 432, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-sds-7', name: 'South Dunes House E', areaName: 'South Dunes Suburb', x: 88, z: 432, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#875736', accentColorHex: '#fbbf24' },
    { id: 'd-x-sds-8', name: 'South Dunes Flats E', areaName: 'South Dunes Suburb', x: 205, z: 432, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-sds-9', name: 'South Dunes Manor S1', areaName: 'South Dunes Suburb', x: -168, z: 472, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-sds-10', name: 'South Dunes Cottage S1', areaName: 'South Dunes Suburb', x: -124, z: 472, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-sds-11', name: 'South Dunes Flats S', areaName: 'South Dunes Suburb', x: -78, z: 472, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-sds-12', name: 'South Dunes Ruin S', areaName: 'South Dunes Suburb', x: -35, z: 472, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-sds-13', name: 'South Dunes Villa S', areaName: 'South Dunes Suburb', x: 42, z: 472, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-sds-14', name: 'South Dunes Cottage S2', areaName: 'South Dunes Suburb', x: 92, z: 472, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-sds-15', name: 'South Dunes Manor S2', areaName: 'South Dunes Suburb', x: 140, z: 472, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#875736', accentColorHex: '#fbbf24' },

    // 15. Northern Frontier Row (along z = -456)
    { id: 'd-x-nfr-1', name: 'Frontier Cottage 1', areaName: 'Northern Frontier', x: -205, z: -476, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dfc198', roofColorHex: '#8d5b34', accentColorHex: '#f59e0b' },
    { id: 'd-x-nfr-2', name: 'Frontier House W', areaName: 'Northern Frontier', x: -162, z: -476, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d4af82', roofColorHex: '#7c4d2d', accentColorHex: '#fbbf24' },
    { id: 'd-x-nfr-3', name: 'Frontier Ruin W', areaName: 'Northern Frontier', x: -116, z: -476, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#b39577', roofColorHex: '#634731', accentColorHex: '#2dd4bf' },
    { id: 'd-x-nfr-4', name: 'Frontier Villa W', areaName: 'Northern Frontier', x: -72, z: -476, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#ebd9be', roofColorHex: '#9a3412', accentColorHex: '#38bdf8' },
    { id: 'd-x-nfr-5', name: 'Frontier Cottage M', areaName: 'Northern Frontier', x: -32, z: -476, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#e7d0ad', roofColorHex: '#9a683e', accentColorHex: '#fb923c' },
    { id: 'd-x-nfr-6', name: 'Frontier Complex E', areaName: 'Northern Frontier', x: 42, z: -476, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#e3c8a5', roofColorHex: '#475569', accentColorHex: '#22d3ee' },
    { id: 'd-x-nfr-7', name: 'Frontier House E', areaName: 'Northern Frontier', x: 92, z: -476, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d7b58c', roofColorHex: '#875736', accentColorHex: '#fbbf24' },
    { id: 'd-x-nfr-8', name: 'Frontier Flats E', areaName: 'Northern Frontier', x: 140, z: -476, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cfa678', roofColorHex: '#6e472c', accentColorHex: '#38bdf8' },
    { id: 'd-x-nfr-9', name: 'Frontier Cottage E', areaName: 'Northern Frontier', x: 186, z: -476, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#d8b489', roofColorHex: '#825433', accentColorHex: '#f97316' },
  ]),
};

export const FOREST_EXPANSION: MapNeighborhoodExpansion = {
  roads: [
    { id: 'f-nbr-nw-lane', startX: -225, startZ: -76, endX: 0, endZ: -76, width: 4.6 },
    { id: 'f-nbr-ne-lane', startX: 0, startZ: -76, endX: 225, endZ: -76, width: 4.6 },
    { id: 'f-nbr-n-mid', startX: -180, startZ: -174, endX: 180, endZ: -174, width: 4.5 },
    { id: 'f-nbr-sw-outer', startX: -315, startZ: 360, endX: -110, endZ: 360, width: 4.6 },
    { id: 'f-nbr-se-outer', startX: 110, startZ: 360, endX: 315, endZ: 360, width: 4.6 },
    { id: 'f-nbr-ne-outer', startX: 110, startZ: -386, endX: 315, endZ: -386, width: 4.6 },
    { id: 'f-nbr-nw-outer', startX: -345, startZ: -378, endX: -205, endZ: -378, width: 4.6 },
    { id: 'f-nbr-pinehill-w', startX: -210, startZ: 278, endX: -28, endZ: 278, width: 4.5 },
    { id: 'f-nbr-pinehill-e', startX: 28, startZ: 278, endX: 210, endZ: 278, width: 4.5 },
    { id: 'f-nbr-ashwood-e', startX: 28, startZ: -278, endX: 160, endZ: -278, width: 4.5 },
    { id: 'f-nbr-westwood', startX: -468, startZ: -175, endX: -468, endZ: 45, width: 4.6 },
    { id: 'f-nbr-eastwood', startX: 468, startZ: -175, endX: 468, endZ: 45, width: 4.6 },
    { id: 'f-nbr-southgate', startX: -225, startZ: 444, endX: 225, endZ: 444, width: 4.6 },
    { id: 'f-nbr-northwood', startX: -220, startZ: -444, endX: 220, endZ: -444, width: 4.6 },
  ],
  areas: [
    { name: 'MOSSBROOK VILLAGE', x: -120, z: -76, kind: 'village' },
    { name: 'CEDAR CREST', x: 120, z: -76, kind: 'residential' },
    { name: 'BIRCHWOOD HOLLOW', x: -215, z: 360, kind: 'village' },
    { name: 'SILVERLEAF DOWNS', x: 215, z: 360, kind: 'residential' },
    { name: 'ALDER RIDGE', x: 215, z: -386, kind: 'residential' },
    { name: 'RIVERBANK CROSSING', x: -155, z: 275, kind: 'village' },
    { name: 'WILLOWCREEK VILLAGE', x: -275, z: -378, kind: 'village' },
    { name: 'PINEHILL CROSSING', x: 0, z: 278, kind: 'residential' },
    { name: 'ASHWOOD AVENUE', x: 120, z: -278, kind: 'residential' },
    { name: 'WESTWOOD LANE', x: -468, z: -65, kind: 'village' },
    { name: 'EASTWOOD TRAIL', x: 468, z: -65, kind: 'village' },
    { name: 'SOUTHGATE COMMONS', x: 0, z: 444, kind: 'residential' },
    { name: 'NORTHWOOD TERRACE', x: 0, z: -444, kind: 'residential' },
  ],
  buildings: buildCluster([
    // 1. Mossbrook Village (NW belt along z = -76)
    { id: 'f-x-nw-1', name: 'Mossbrook Cabin', areaName: 'Mossbrook Village', x: -190, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-nw-2', name: 'Woodland Homestead', areaName: 'Mossbrook Village', x: -152, z: -56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-nw-3', name: 'Old Forester Ruin', areaName: 'Mossbrook Village', x: -112, z: -56, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-nw-4', name: 'Brookside Cottage', areaName: 'Mossbrook Village', x: -72, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#a98560', roofColorHex: '#473628', accentColorHex: '#38bdf8' },
    { id: 'f-x-nw-5', name: 'Mossbrook Timber House', areaName: 'Mossbrook Village', x: -190, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#f59e0b' },
    { id: 'f-x-nw-6', name: 'Fernwood Villa', areaName: 'Mossbrook Village', x: -148, z: -98, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-nw-7', name: 'Mossbrook Hut', areaName: 'Mossbrook Village', x: -108, z: -98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b38d68', roofColorHex: '#523b2a', accentColorHex: '#fbbf24' },
    { id: 'f-x-nw-8', name: 'Timberline Barn', areaName: 'Mossbrook Village', x: -42, z: -98, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#8b7b6b', roofColorHex: '#374151', accentColorHex: '#f97316' },

    // 2. Cedar Crest (NE belt along z = -76)
    { id: 'f-x-ne-1', name: 'Cedar Crest Duplex', areaName: 'Cedar Crest', x: 46, z: -56, width: 21.8, depth: 16.9, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-ne-2', name: 'Cedar Crest Villa', areaName: 'Cedar Crest', x: 96, z: -56, width: 22.3, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#dee0d6', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-ne-3', name: 'Cedar Cabin East', areaName: 'Cedar Crest', x: 148, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b7936c', roofColorHex: '#4b3828', accentColorHex: '#fbbf24' },
    { id: 'f-x-ne-4', name: 'Oakridge Apartments', areaName: 'Cedar Crest', x: 188, z: -56, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-ne-5', name: 'Cedar Lodge North', areaName: 'Cedar Crest', x: 42, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#bfa990', roofColorHex: '#473728', accentColorHex: '#f59e0b' },
    { id: 'f-x-ne-6', name: 'Abandoned Cabin', areaName: 'Cedar Crest', x: 100, z: -98, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8a8073', roofColorHex: '#3b3733', accentColorHex: '#2dd4bf' },
    { id: 'f-x-ne-7', name: 'Pinecone Cottage', areaName: 'Cedar Crest', x: 152, z: -98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-ne-8', name: 'Cedar Manor', areaName: 'Cedar Crest', x: 190, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#cbc2b3', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },

    // 3. Inner-Ring North Belt (along z = -174)
    { id: 'f-x-nm-1', name: 'Mossbrook Terrace', areaName: 'Mossbrook Village', x: -150, z: -154, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-nm-2', name: 'Northglade Hut', areaName: 'Mossbrook Village', x: -112, z: -154, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-nm-3', name: 'Northglade Ruins', areaName: 'Mossbrook Village', x: -42, z: -154, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },
    { id: 'f-x-nm-4', name: 'Cedar Crest Manor', areaName: 'Cedar Crest', x: 46, z: -154, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#dee0d6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-nm-5', name: 'Cedar Flats West', areaName: 'Cedar Crest', x: 98, z: -154, width: 21.8, depth: 16.9, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#22d3ee' },
    { id: 'f-x-nm-6', name: 'Cedar Flats East', areaName: 'Cedar Crest', x: 148, z: -154, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#fbbf24' },

    // 4. Birchwood Hollow (SW outer along z = 360)
    { id: 'f-x-swo-1', name: 'Birchwood Ruin', areaName: 'Birchwood Hollow', x: -306, z: 336, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#8e8476', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },
    { id: 'f-x-swo-2', name: 'Birchwood Cottage', areaName: 'Birchwood Hollow', x: -272, z: 336, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946e', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-swo-3', name: 'Birchwood House', areaName: 'Birchwood Hollow', x: -244, z: 336, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c7b8a3', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-swo-4', name: 'Birchwood Flats', areaName: 'Birchwood Hollow', x: -176, z: 336, width: 21.6, depth: 17.2, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#bbb1a2', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-swo-5', name: 'Hollow Small Home', areaName: 'Birchwood Hollow', x: -134, z: 336, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#f59e0b' },
    { id: 'f-x-swo-6', name: 'Hollow Woodland Villa', areaName: 'Birchwood Hollow', x: -286, z: 384, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#dbd9d0', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-swo-7', name: 'South Clearing Hut', areaName: 'Birchwood Hollow', x: -246, z: 384, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b6926c', roofColorHex: '#4b3828', accentColorHex: '#fbbf24' },
    { id: 'f-x-swo-8', name: 'Weathered Barn House', areaName: 'Birchwood Hollow', x: -206, z: 384, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3d3934', accentColorHex: '#2dd4bf' },
    { id: 'f-x-swo-9', name: 'Birchwood Lodge', areaName: 'Birchwood Hollow', x: -164, z: 384, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#473728', accentColorHex: '#38bdf8' },
    { id: 'f-x-swo-10', name: 'Hollow Timber Depot', areaName: 'Birchwood Hollow', x: -122, z: 384, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#8a7a6a', roofColorHex: '#374151', accentColorHex: '#f97316' },

    // 5. Silverleaf Downs (SE outer along z = 360)
    { id: 'f-x-seo-1', name: 'Silverleaf Villa West', areaName: 'Silverleaf Downs', x: 140, z: 336, width: 22.3, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#dcdbd2', roofColorHex: '#3e4c3a', accentColorHex: '#4ade80' },
    { id: 'f-x-seo-2', name: 'Silverleaf Complex', areaName: 'Silverleaf Downs', x: 184, z: 336, width: 22.0, depth: 17.4, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#cfd2c8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-seo-3', name: 'Silverleaf Cabin A', areaName: 'Silverleaf Downs', x: 242, z: 336, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#fbbf24' },
    { id: 'f-x-seo-4', name: 'Silverleaf House', areaName: 'Silverleaf Downs', x: 274, z: 336, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c6b7a2', roofColorHex: '#3f4f3c', accentColorHex: '#f59e0b' },
    { id: 'f-x-seo-5', name: 'Forest Outpost East', areaName: 'Silverleaf Downs', x: 304, z: 336, width: 20.3, depth: 16.1, rotationY: Math.PI, style: 'cyber_outpost', wallColorHex: '#9da79d', roofColorHex: '#1f2937', accentColorHex: '#22d3ee' },
    { id: 'f-x-seo-6', name: 'Silverleaf Apartments', areaName: 'Silverleaf Downs', x: 136, z: 384, width: 21.6, depth: 16.9, rotationY: 0, style: 'apartment_block', wallColorHex: '#bfb4a5', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-seo-7', name: 'Silverleaf Ruins', areaName: 'Silverleaf Downs', x: 178, z: 384, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },
    { id: 'f-x-seo-8', name: 'Silverleaf Cabin B', areaName: 'Silverleaf Downs', x: 218, z: 384, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b08b65', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-seo-9', name: 'Downs Manor', areaName: 'Silverleaf Downs', x: 256, z: 384, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c9bba7', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-seo-10', name: 'Downs Grand Villa', areaName: 'Silverleaf Downs', x: 296, z: 384, width: 22.0, depth: 16.9, rotationY: 0, style: 'luxury_villa', wallColorHex: '#dedcd3', roofColorHex: '#334155', accentColorHex: '#4ade80' },

    // 6. Alder Ridge (NE outer along z = -386, clear of f-city-house3 at (255, -356))
    { id: 'f-x-neo-1', name: 'Alder Bio Lab', areaName: 'Alder Ridge', x: 140, z: -362, width: 20.4, depth: 16.4, rotationY: Math.PI, style: 'futuristic_lab', wallColorHex: '#cfd6cf', roofColorHex: '#1f2937', accentColorHex: '#22d3ee' },
    { id: 'f-x-neo-2', name: 'Alder Terrace', areaName: 'Alder Ridge', x: 186, z: -362, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d2d4cc', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-neo-3', name: 'Alder Residence', areaName: 'Alder Ridge', x: 298, z: -362, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c7b8a3', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-neo-4', name: 'Alder Villa North', areaName: 'Alder Ridge', x: 140, z: -410, width: 22.0, depth: 16.9, rotationY: 0, style: 'luxury_villa', wallColorHex: '#dcdbd2', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-neo-5', name: 'Alder Heights', areaName: 'Alder Ridge', x: 184, z: -410, width: 21.6, depth: 16.9, rotationY: 0, style: 'apartment_block', wallColorHex: '#c2b6a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-neo-6', name: 'Alder Cottage North', areaName: 'Alder Ridge', x: 224, z: -410, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b7926b', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-neo-7', name: 'Alder Homestead', areaName: 'Alder Ridge', x: 262, z: -410, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#cbbda8', roofColorHex: '#473728', accentColorHex: '#fbbf24' },

    // 7. Riverbank Crossing & Clearings (open pockets well clear of existing houses and river)
    { id: 'f-x-mid-1', name: 'Riverbank Cabin West', areaName: 'Riverbank Crossing', x: -162, z: 256, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-mid-2', name: 'Riverbank Manor', areaName: 'Riverbank Crossing', x: -162, z: 298, width: 22.0, depth: 16.8, rotationY: Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#dcdbd2', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-mid-3', name: 'Eastbank Cottage A', areaName: 'Riverbank Crossing', x: 162, z: 256, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-mid-4', name: 'Eastbank Complex', areaName: 'Riverbank Crossing', x: 162, z: 298, width: 21.8, depth: 16.9, rotationY: -Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#cfd2c8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-mid-5', name: 'South Pines Ruin', areaName: 'Riverbank Crossing', x: 64, z: 320, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },
    { id: 'f-x-mid-6', name: 'Northbridge Cottage', areaName: 'Mossbrook Village', x: -175, z: -26, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-mid-7', name: 'Oakbridge House', areaName: 'Cedar Crest', x: 175, z: -26, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-mid-8', name: 'Forest West Cottage', areaName: 'Mossbrook Village', x: -175, z: 26, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#f59e0b' },
    // Open-world perimeter forest cabins
    { id: 'f-x-open-1', name: 'West Glade Cabin', areaName: 'Fernwood Hamlet', x: -435, z: -95, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-open-2', name: 'Sanatorium Lodge', areaName: 'Old Sanatorium', x: -435, z: 50, width: 20.1, depth: 16.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },
    { id: 'f-x-open-3', name: 'Whispering Ranger Post', areaName: 'Whispering Woods', x: 435, z: -95, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-open-4', name: 'Whispering Hut', areaName: 'Whispering Woods', x: 435, z: 75, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-open-5', name: 'NW Clearing Homestead', areaName: 'Emerald Estates', x: -308, z: -356, width: 20.6, depth: 16.4, rotationY: 0.35, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#3e4c3a', accentColorHex: '#38bdf8' },
    { id: 'f-x-open-6', name: 'NW Outskirts Cabin', areaName: 'Emerald Estates', x: -355, z: -345, width: 16.4, depth: 13.4, rotationY: 0.35, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#fbbf24' },
    { id: 'f-x-open-7', name: 'South Pines Hideout', areaName: 'Sawmill Depot', x: 64, z: 418, width: 18.8, depth: 15.0, rotationY: -0.25, style: 'abandoned_building', wallColorHex: '#8d8375', roofColorHex: '#3e3a34', accentColorHex: '#2dd4bf' },

    // 8. Willowcreek Village (NW outer along z = -378)
    { id: 'f-x-wil-1', name: 'Willowcreek Cabin 1', areaName: 'Willowcreek Village', x: -322, z: -396, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-wil-2', name: 'Willowcreek House', areaName: 'Willowcreek Village', x: -286, z: -396, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-wil-3', name: 'Willowcreek Villa', areaName: 'Willowcreek Village', x: -246, z: -396, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-wil-4', name: 'Willowcreek Flats', areaName: 'Willowcreek Village', x: -204, z: -396, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-wil-5', name: 'Willowcreek Ruins', areaName: 'Willowcreek Village', x: -195, z: -358, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-wil-6', name: 'Willowcreek Hut', areaName: 'Willowcreek Village', x: -152, z: -358, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#a98560', roofColorHex: '#473628', accentColorHex: '#38bdf8' },

    // 9. Pinehill Crossing (South of river along z = 278, clear of existing houses) & Ashwood Avenue (North-mid z = -278)
    { id: 'f-x-pin-1', name: 'Ashwood Cabin 1', areaName: 'Ashwood Avenue', x: 36, z: -258, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-pin-2', name: 'Ashwood House W', areaName: 'Ashwood Avenue', x: 72, z: -256, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-pin-3', name: 'Pinehill Ruins W', areaName: 'Pinehill Crossing', x: -36, z: 256, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-pin-4', name: 'Pinehill Villa E', areaName: 'Pinehill Crossing', x: 44, z: 252, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#dee0d6', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-pin-5', name: 'Pinehill Complex E', areaName: 'Pinehill Crossing', x: 124, z: 252, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-pin-6', name: 'Ashwood Villa E', areaName: 'Ashwood Avenue', x: 108, z: -256, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-pin-7', name: 'Pinehill Flats SW', areaName: 'Pinehill Crossing', x: -74, z: 291, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-pin-8', name: 'Pinehill Homestead SE', areaName: 'Pinehill Crossing', x: 64, z: 296, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-pin-9', name: 'Pinehill Outpost SE', areaName: 'Pinehill Crossing', x: 96, z: 320, width: 19.6, depth: 15.6, rotationY: Math.PI, style: 'cyber_outpost', wallColorHex: '#9da79d', roofColorHex: '#1f2937', accentColorHex: '#22d3ee' },
    { id: 'f-x-ash-1', name: 'Ashwood Flats E', areaName: 'Ashwood Avenue', x: 146, z: -256, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-ash-2', name: 'Ashwood Ruins N', areaName: 'Ashwood Avenue', x: 38, z: -298, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-ash-3', name: 'Ashwood Cottage N', areaName: 'Ashwood Avenue', x: 80, z: -298, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-ash-4', name: 'Ashwood Complex N', areaName: 'Ashwood Avenue', x: 142, z: -300, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-ash-5', name: 'Ashwood Cabin NW', areaName: 'Ashwood Avenue', x: -38, z: -298, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#fbbf24' },
    { id: 'f-x-ash-6', name: 'Ashwood House NW', areaName: 'Ashwood Avenue', x: -38, z: -258, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#f59e0b' },

    // 10. Westwood Lane (along x = -468, north of river)
    { id: 'f-x-wwl-1', name: 'Westwood Cabin 1', areaName: 'Westwood Lane', x: -488, z: -150, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-wwl-2', name: 'Westwood Manor', areaName: 'Westwood Lane', x: -488, z: -110, width: 20.6, depth: 16.4, rotationY: Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-wwl-3', name: 'Westwood Ruins', areaName: 'Westwood Lane', x: -488, z: -70, width: 18.6, depth: 15.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-wwl-4', name: 'Westwood Villa', areaName: 'Westwood Lane', x: -488, z: -28, width: 22.0, depth: 16.8, rotationY: Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-wwl-5', name: 'Westwood Complex', areaName: 'Westwood Lane', x: -488, z: 18, width: 21.8, depth: 16.8, rotationY: Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-wwl-6', name: 'Westwood Barn E', areaName: 'Westwood Lane', x: -442, z: -145, width: 21.0, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'warehouse', wallColorHex: '#8b7b6b', roofColorHex: '#374151', accentColorHex: '#f97316' },
    { id: 'f-x-wwl-7', name: 'Westwood Cottage E', areaName: 'Westwood Lane', x: -442, z: -45, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#a98560', roofColorHex: '#473628', accentColorHex: '#38bdf8' },
    { id: 'f-x-wwl-8', name: 'Westwood House E', areaName: 'Westwood Lane', x: -442, z: 18, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },

    // 11. Eastwood Trail (along x = 468, north of river)
    { id: 'f-x-ewt-1', name: 'Eastwood Cabin 1', areaName: 'Eastwood Trail', x: 488, z: -150, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-ewt-2', name: 'Eastwood Manor', areaName: 'Eastwood Trail', x: 488, z: -110, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-ewt-3', name: 'Eastwood Flats', areaName: 'Eastwood Trail', x: 488, z: -68, width: 21.6, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-ewt-4', name: 'Eastwood Villa', areaName: 'Eastwood Trail', x: 488, z: -26, width: 22.0, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#dee0d6', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-ewt-5', name: 'Eastwood Ruins', areaName: 'Eastwood Trail', x: 488, z: 20, width: 18.6, depth: 15.0, rotationY: -Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-ewt-6', name: 'Eastwood Barn W', areaName: 'Eastwood Trail', x: 442, z: -145, width: 21.0, depth: 16.4, rotationY: Math.PI * 0.5, style: 'warehouse', wallColorHex: '#8b7b6b', roofColorHex: '#374151', accentColorHex: '#f97316' },
    { id: 'f-x-ewt-7', name: 'Eastwood Cottage W', areaName: 'Eastwood Trail', x: 442, z: -45, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#a98560', roofColorHex: '#473628', accentColorHex: '#38bdf8' },
    { id: 'f-x-ewt-8', name: 'Eastwood Lab W', areaName: 'Eastwood Trail', x: 442, z: 18, width: 20.4, depth: 16.4, rotationY: Math.PI * 0.5, style: 'futuristic_lab', wallColorHex: '#cfd6cf', roofColorHex: '#1f2937', accentColorHex: '#22d3ee' },

    // 12. Southgate Commons (along z = 444)
    { id: 'f-x-sgc-1', name: 'Southgate Cabin 1', areaName: 'Southgate Commons', x: -200, z: 424, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-sgc-2', name: 'Southgate House W', areaName: 'Southgate Commons', x: -158, z: 424, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-sgc-3', name: 'Southgate Ruins W', areaName: 'Southgate Commons', x: -114, z: 424, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-sgc-4', name: 'Southgate Villa W', areaName: 'Southgate Commons', x: -70, z: 424, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-sgc-5', name: 'Southgate Cabin M', areaName: 'Southgate Commons', x: -30, z: 424, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#a98560', roofColorHex: '#473628', accentColorHex: '#38bdf8' },
    { id: 'f-x-sgc-6', name: 'Southgate Complex E', areaName: 'Southgate Commons', x: 114, z: 424, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-sgc-7', name: 'Southgate House E', areaName: 'Southgate Commons', x: 160, z: 424, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-sgc-8', name: 'Southgate Cabin E', areaName: 'Southgate Commons', x: 202, z: 424, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-sgc-9', name: 'Southgate House S1', areaName: 'Southgate Commons', x: -162, z: 464, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#473728', accentColorHex: '#fbbf24' },
    { id: 'f-x-sgc-10', name: 'Southgate Cabin S1', areaName: 'Southgate Commons', x: -118, z: 464, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-sgc-11', name: 'Southgate Flats S', areaName: 'Southgate Commons', x: -72, z: 464, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-sgc-12', name: 'Southgate Ruins S', areaName: 'Southgate Commons', x: -30, z: 464, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-sgc-13', name: 'Southgate Villa S', areaName: 'Southgate Commons', x: 42, z: 464, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#dee0d6', roofColorHex: '#3f4f3c', accentColorHex: '#4ade80' },
    { id: 'f-x-sgc-14', name: 'Southgate Cabin S2', areaName: 'Southgate Commons', x: 92, z: 464, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b08b65', roofColorHex: '#4a3626', accentColorHex: '#f59e0b' },
    { id: 'f-x-sgc-15', name: 'Southgate House S2', areaName: 'Southgate Commons', x: 136, z: 464, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c9bba7', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },

    // 13. Northwood Terrace (along z = -444)
    { id: 'f-x-nwt-1', name: 'Northwood Cabin 1', areaName: 'Northwood Terrace', x: -190, z: -464, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
    { id: 'f-x-nwt-2', name: 'Northwood House W', areaName: 'Northwood Terrace', x: -148, z: -464, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8b8a2', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-nwt-3', name: 'Northwood Ruins W', areaName: 'Northwood Terrace', x: -102, z: -464, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#8d8376', roofColorHex: '#3f3b36', accentColorHex: '#2dd4bf' },
    { id: 'f-x-nwt-4', name: 'Northwood Villa W', areaName: 'Northwood Terrace', x: -58, z: -464, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#d9d8cf', roofColorHex: '#334155', accentColorHex: '#4ade80' },
    { id: 'f-x-nwt-5', name: 'Northwood Complex E', areaName: 'Northwood Terrace', x: 42, z: -464, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#d2cfc7', roofColorHex: '#374151', accentColorHex: '#38bdf8' },
    { id: 'f-x-nwt-6', name: 'Northwood House E', areaName: 'Northwood Terrace', x: 92, z: -464, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c5b199', roofColorHex: '#3e4c3a', accentColorHex: '#fbbf24' },
    { id: 'f-x-nwt-7', name: 'Northwood Flats E', areaName: 'Northwood Terrace', x: 140, z: -464, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#c4b8a6', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 'f-x-nwt-8', name: 'Northwood Cabin E', areaName: 'Northwood Terrace', x: 184, z: -464, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#ae8962', roofColorHex: '#4a3626', accentColorHex: '#4ade80' },
    { id: 'f-x-nwt-9', name: 'Northwood Barn S', areaName: 'Northwood Terrace', x: -150, z: -424, width: 21.0, depth: 16.4, rotationY: Math.PI, style: 'warehouse', wallColorHex: '#8b7b6b', roofColorHex: '#374151', accentColorHex: '#f97316' },
    { id: 'f-x-nwt-10', name: 'Northwood Manor S', areaName: 'Northwood Terrace', x: -74, z: -424, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c6b6a1', roofColorHex: '#473728', accentColorHex: '#fbbf24' },
    { id: 'f-x-nwt-11', name: 'Northwood Cottage S', areaName: 'Northwood Terrace', x: 74, z: -424, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b8946f', roofColorHex: '#4b3828', accentColorHex: '#4ade80' },
  ]),
};

export const SNOW_EXPANSION: MapNeighborhoodExpansion = {
  roads: [
    { id: 's-nbr-nw-lane', startX: -225, startZ: -76, endX: 0, endZ: -76, width: 4.6 },
    { id: 's-nbr-sw-lane', startX: -225, startZ: 76, endX: 0, endZ: 76, width: 4.6 },
    { id: 's-nbr-se-lane', startX: 0, startZ: 76, endX: 225, endZ: 76, width: 4.6 },
    { id: 's-nbr-nw-mid', startX: -180, startZ: -174, endX: -25, endZ: -174, width: 4.5 },
    { id: 's-nbr-sw-outer', startX: -320, startZ: 365, endX: -110, endZ: 365, width: 4.6 },
    { id: 's-nbr-se-outer', startX: 110, startZ: 365, endX: 320, endZ: 365, width: 4.6 },
    { id: 's-nbr-ne-outer', startX: 110, startZ: -392, endX: 320, endZ: -392, width: 4.6 },
    { id: 's-nbr-nw-outer', startX: -365, startZ: -388, endX: -210, endZ: -388, width: 4.6 },
    { id: 's-nbr-frostvale-w', startX: -210, startZ: 186, endX: -28, endZ: 186, width: 4.5 },
    { id: 's-nbr-frostvale-e', startX: 28, startZ: 186, endX: 210, endZ: 186, width: 4.5 },
    { id: 's-nbr-snowridge', startX: -468, startZ: -175, endX: -468, endZ: 175, width: 4.6 },
    { id: 's-nbr-tundra', startX: 468, startZ: -175, endX: 468, endZ: 175, width: 4.6 },
    { id: 's-nbr-s-glacier', startX: -230, startZ: 448, endX: 230, endZ: 448, width: 4.6 },
    { id: 's-nbr-n-aurora', startX: -220, startZ: -450, endX: 220, endZ: -450, width: 4.6 },
  ],
  areas: [
    { name: 'FROSTPINE TERRACE', x: -120, z: -76, kind: 'residential' },
    { name: 'WINTERBROOK', x: -120, z: 76, kind: 'village' },
    { name: 'BOREAL SQUARE', x: 120, z: 76, kind: 'residential' },
    { name: 'GLACIERVIEW HOMES', x: -215, z: 365, kind: 'village' },
    { name: 'POLARIS ESTATES', x: 215, z: 365, kind: 'residential' },
    { name: 'PERMAFROST ROW', x: 215, z: -392, kind: 'residential' },
    { name: 'GLACIERCREST VILLAGE', x: -288, z: -388, kind: 'village' },
    { name: 'FROSTVALE BOULEVARD', x: 0, z: 186, kind: 'residential' },
    { name: 'SNOWRIDGE AVENUE', x: -468, z: 0, kind: 'village' },
    { name: 'TUNDRA TERRACE', x: 468, z: 0, kind: 'village' },
    { name: 'SOUTH GLACIER WAY', x: 0, z: 448, kind: 'residential' },
    { name: 'NORTHERN AURORA', x: 0, z: -450, kind: 'residential' },
  ],
  buildings: buildCluster([
    // 1. Frostpine Terrace (NW belt along z = -76)
    { id: 's-x-nw-1', name: 'Frostpine Chalet', areaName: 'Frostpine Terrace', x: -190, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nw-2', name: 'Nordic Timber House', areaName: 'Frostpine Terrace', x: -152, z: -56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-nw-3', name: 'Frozen Ruin Cabin', areaName: 'Frostpine Terrace', x: -112, z: -56, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-nw-4', name: 'Frostpine Cottage', areaName: 'Frostpine Terrace', x: -72, z: -56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-nw-5', name: 'Glacier Terrace Lodge', areaName: 'Frostpine Terrace', x: -190, z: -98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d5dee8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nw-6', name: 'Frostpine Villa', areaName: 'Frostpine Terrace', x: -148, z: -98, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-nw-7', name: 'Pinehearth Hut', areaName: 'Frostpine Terrace', x: -108, z: -98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#a58c74', roofColorHex: '#3b4a5e', accentColorHex: '#fbbf24' },
    { id: 's-x-nw-8', name: 'Alpine Supply Barn', areaName: 'Frostpine Terrace', x: -42, z: -98, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#8d99a6', roofColorHex: '#1f2937', accentColorHex: '#38bdf8' },

    // 2. Winterbrook (SW belt along z = 76)
    { id: 's-x-sw-1', name: 'Winterbrook Cabin A', areaName: 'Winterbrook', x: -190, z: 56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dae2eb', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-sw-2', name: 'Winterbrook Ruins', areaName: 'Winterbrook', x: -152, z: 56, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-sw-3', name: 'Winterbrook House', areaName: 'Winterbrook', x: -112, z: 56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#ccd6e0', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-sw-4', name: 'Snowcap Villa', areaName: 'Winterbrook', x: -64, z: 56, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-sw-5', name: 'Winterbrook Flats', areaName: 'Winterbrook', x: -190, z: 98, width: 21.6, depth: 16.9, rotationY: 0, style: 'apartment_block', wallColorHex: '#c3cedb', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-sw-6', name: 'Winterbrook Cabin B', areaName: 'Winterbrook', x: -148, z: 98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-sw-7', name: 'Hearthstone Cottage', areaName: 'Winterbrook', x: -102, z: 98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-sw-8', name: 'South Ice Barn', areaName: 'Winterbrook', x: -46, z: 98, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#8c99a7', roofColorHex: '#1f2937', accentColorHex: '#22d3ee' },

    // 3. Boreal Square (SE belt along z = 76)
    { id: 's-x-se-1', name: 'Boreal Apartments', areaName: 'Boreal Square', x: 46, z: 56, width: 21.6, depth: 16.9, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cfd8e3', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-se-2', name: 'Boreal Complex', areaName: 'Boreal Square', x: 96, z: 56, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-se-3', name: 'Boreal Chalet West', areaName: 'Boreal Square', x: 148, z: 56, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-se-4', name: 'Boreal Manor', areaName: 'Boreal Square', x: 188, z: 56, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-se-5', name: 'Boreal Villa', areaName: 'Boreal Square', x: 42, z: 98, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-se-6', name: 'Icebound Ruins', areaName: 'Boreal Square', x: 100, z: 98, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-se-7', name: 'Boreal Chalet East', areaName: 'Boreal Square', x: 152, z: 98, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-se-8', name: 'Boreal Residence', areaName: 'Boreal Square', x: 190, z: 98, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#cbd5e1', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },

    // 4. NW Inner Belt (along z = -174) & South Inner Pocket
    { id: 's-x-nm-1', name: 'Frostpine Terrace House', areaName: 'Frostpine Terrace', x: -150, z: -154, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-nm-2', name: 'Frostpine Hut North', areaName: 'Frostpine Terrace', x: -112, z: -154, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nm-3', name: 'Frostpine Ruins North', areaName: 'Frostpine Terrace', x: -42, z: -154, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-nm-4', name: 'Frosthaven Flats', areaName: 'Frostpine Terrace', x: -150, z: -194, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nm-5', name: 'Frosthaven Lodge', areaName: 'Frostpine Terrace', x: -74, z: -194, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#d5dee8', roofColorHex: '#1e3a5f', accentColorHex: '#fbbf24' },
    { id: 's-x-nm-6', name: 'Cryo Ridge Cottage', areaName: 'Boreal Square', x: 74, z: 174, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },

    // 5. Glacierview Homes (SW outer along z = 365)
    { id: 's-x-swo-1', name: 'Glacierview Ruin', areaName: 'Glacierview Homes', x: -306, z: 342, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-swo-2', name: 'Glacierview Hut A', areaName: 'Glacierview Homes', x: -274, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-swo-3', name: 'Glacierview House', areaName: 'Glacierview Homes', x: -244, z: 342, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-swo-4', name: 'Glacierview Flats', areaName: 'Glacierview Homes', x: -178, z: 342, width: 21.6, depth: 17.2, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-swo-5', name: 'Glacierview Hut B', areaName: 'Glacierview Homes', x: -136, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-swo-6', name: 'Glacierview Villa', areaName: 'Glacierview Homes', x: -292, z: 390, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-swo-7', name: 'Snowline Cabin', areaName: 'Glacierview Homes', x: -252, z: 390, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dae2eb', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-swo-8', name: 'Frozen Lodge Ruin', areaName: 'Glacierview Homes', x: -214, z: 390, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-swo-9', name: 'Glacierview Manor', areaName: 'Glacierview Homes', x: -172, z: 390, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-swo-10', name: 'Glacierview Depot', areaName: 'Glacierview Homes', x: -130, z: 390, width: 21.0, depth: 16.4, rotationY: 0, style: 'warehouse', wallColorHex: '#8c99a7', roofColorHex: '#1f2937', accentColorHex: '#f97316' },

    // 6. Polaris Estates (SE outer along z = 365)
    { id: 's-x-seo-1', name: 'Polaris Villa West', areaName: 'Polaris Estates', x: 140, z: 342, width: 22.3, depth: 16.9, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-seo-2', name: 'Polaris Complex', areaName: 'Polaris Estates', x: 184, z: 342, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-seo-3', name: 'Polaris Cabin A', areaName: 'Polaris Estates', x: 242, z: 342, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-seo-4', name: 'Polaris House', areaName: 'Polaris Estates', x: 274, z: 342, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-seo-5', name: 'Polaris Tech Post', areaName: 'Polaris Estates', x: 306, z: 342, width: 20.3, depth: 16.1, rotationY: Math.PI, style: 'cyber_outpost', wallColorHex: '#9aa8b8', roofColorHex: '#0f172a', accentColorHex: '#22d3ee' },
    { id: 's-x-seo-6', name: 'Polaris Towers', areaName: 'Polaris Estates', x: 136, z: 390, width: 21.6, depth: 16.9, rotationY: 0, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-seo-7', name: 'Polaris Ruins', areaName: 'Polaris Estates', x: 178, z: 390, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-seo-8', name: 'Polaris Cabin B', areaName: 'Polaris Estates', x: 218, z: 390, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-seo-9', name: 'Polaris Manor', areaName: 'Polaris Estates', x: 256, z: 390, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-seo-10', name: 'Polaris Grand Villa', areaName: 'Polaris Estates', x: 298, z: 390, width: 22.0, depth: 16.9, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#334155', accentColorHex: '#22d3ee' },

    // 7. Permafrost Row (NE outer along z = -392, clear of s-villa-7 at (255, -356))
    { id: 's-x-neo-1', name: 'Permafrost Cryo Lab', areaName: 'Permafrost Row', x: 140, z: -368, width: 20.4, depth: 16.4, rotationY: Math.PI, style: 'futuristic_lab', wallColorHex: '#dbe4ee', roofColorHex: '#0f172a', accentColorHex: '#22d3ee' },
    { id: 's-x-neo-2', name: 'Permafrost Complex', areaName: 'Permafrost Row', x: 186, z: -368, width: 22.0, depth: 17.2, rotationY: Math.PI, style: 'residential_complex', wallColorHex: '#d5dee8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-neo-3', name: 'Permafrost House', areaName: 'Permafrost Row', x: 300, z: -368, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-neo-4', name: 'Permafrost Villa', areaName: 'Permafrost Row', x: 140, z: -414, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-neo-5', name: 'Permafrost Heights', areaName: 'Permafrost Row', x: 184, z: -414, width: 21.6, depth: 16.9, rotationY: 0, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-neo-6', name: 'Permafrost Hut B', areaName: 'Permafrost Row', x: 224, z: -414, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-neo-7', name: 'Permafrost Homestead', areaName: 'Permafrost Row', x: 262, z: -414, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },

    // 8. Scattered Open-World Chalets & Glacial Outposts (clear of Snow Lake centered at (112, -124))
    { id: 's-x-open-1', name: 'Lakeshore Cabin East', areaName: 'Frozen Glacier Lake', x: 192, z: -124, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-open-2', name: 'Lakeshore South House', areaName: 'Frozen Glacier Lake', x: 112, z: -52, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-open-3', name: 'West Ridge Cabin', areaName: 'Snowdrift Hamlet', x: -445, z: -95, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-open-4', name: 'Abandoned Radar Hut', areaName: 'Abandoned Radar', x: -445, z: 95, width: 18.8, depth: 15.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-open-5', name: 'Tundra Lodge East', areaName: 'Tundra Refinery', x: 445, z: -95, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-open-6', name: 'Tundra Outpost Hut', areaName: 'Tundra Refinery', x: 445, z: 95, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-open-7', name: 'NW Frosthaven Outskirts', areaName: 'Frosthaven Metropolis', x: -305, z: -365, width: 20.6, depth: 16.4, rotationY: 0.35, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-open-8', name: 'NW Alpine Ruin', areaName: 'Frosthaven Metropolis', x: -360, z: -340, width: 18.6, depth: 15.0, rotationY: 0.35, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-open-9', name: 'Lakeshore North Watch', areaName: 'Frozen Glacier Lake', x: 112, z: -194, width: 19.6, depth: 15.6, rotationY: Math.PI, style: 'cyber_outpost', wallColorHex: '#9aa8b8', roofColorHex: '#0f172a', accentColorHex: '#22d3ee' },
    { id: 's-x-open-10', name: 'North Icebound Chalet', areaName: 'Frostlake Observatory', x: -85, z: -345, width: 16.4, depth: 13.4, rotationY: 0.25, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },

    // 9. Glaciercrest Village (NW outer along z = -388)
    { id: 's-x-gcv-1', name: 'Glaciercrest Chalet 1', areaName: 'Glaciercrest Village', x: -332, z: -404, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-gcv-2', name: 'Glaciercrest Lodge', areaName: 'Glaciercrest Village', x: -298, z: -408, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-gcv-3', name: 'Glaciercrest Villa', areaName: 'Glaciercrest Village', x: -260, z: -408, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-gcv-4', name: 'Glaciercrest Flats', areaName: 'Glaciercrest Village', x: -220, z: -408, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-gcv-5', name: 'Glaciercrest Ruins', areaName: 'Glaciercrest Village', x: -340, z: -366, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-gcv-6', name: 'Glaciercrest Hut', areaName: 'Glaciercrest Village', x: -192, z: -366, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },

    // 10. Frostvale Boulevard (Mid-South along z = 186)
    { id: 's-x-fvb-1', name: 'Frostvale Chalet W1', areaName: 'Frostvale Boulevard', x: -190, z: 165, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-fvb-2', name: 'Frostvale House W', areaName: 'Frostvale Boulevard', x: -150, z: 165, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-fvb-3', name: 'Frostvale Villa W', areaName: 'Frostvale Boulevard', x: -105, z: 165, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-fvb-4', name: 'Frostvale Ruins W', areaName: 'Frostvale Boulevard', x: -45, z: 165, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-fvb-5', name: 'Frostvale Complex E', areaName: 'Frostvale Boulevard', x: 118, z: 165, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-fvb-6', name: 'Frostvale House E', areaName: 'Frostvale Boulevard', x: 162, z: 165, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-fvb-7', name: 'Frostvale Chalet E', areaName: 'Frostvale Boulevard', x: 198, z: 165, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#fbbf24' },
    { id: 's-x-fvb-8', name: 'Frostvale Chalet SW', areaName: 'Frostvale Boulevard', x: -190, z: 204, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dae2eb', roofColorHex: '#334155', accentColorHex: '#f59e0b' },
    { id: 's-x-fvb-9', name: 'Frostvale Flats SW', areaName: 'Frostvale Boulevard', x: -148, z: 204, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-fvb-10', name: 'Frostvale Manor SW', areaName: 'Frostvale Boulevard', x: -104, z: 204, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-fvb-11', name: 'Frostvale Villa SE', areaName: 'Frostvale Boulevard', x: 96, z: 204, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-fvb-12', name: 'Frostvale Chalet SE', areaName: 'Frostvale Boulevard', x: 148, z: 204, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#fbbf24' },
    { id: 's-x-fvb-13', name: 'Frostvale Ruins SE', areaName: 'Frostvale Boulevard', x: 188, z: 204, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },

    // 11. Snowridge Avenue (along x = -468)
    { id: 's-x-snr-1', name: 'Snowridge Chalet 1', areaName: 'Snowridge Avenue', x: -488, z: -148, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-snr-2', name: 'Snowridge Lodge 1', areaName: 'Snowridge Avenue', x: -488, z: -108, width: 20.6, depth: 16.4, rotationY: Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-snr-3', name: 'Snowridge Ruins 1', areaName: 'Snowridge Avenue', x: -488, z: -68, width: 18.6, depth: 15.0, rotationY: Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-snr-4', name: 'Snowridge Villa 1', areaName: 'Snowridge Avenue', x: -488, z: -26, width: 22.0, depth: 16.8, rotationY: Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-snr-5', name: 'Snowridge Complex', areaName: 'Snowridge Avenue', x: -488, z: 26, width: 21.8, depth: 16.8, rotationY: Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-snr-6', name: 'Snowridge Chalet 2', areaName: 'Snowridge Avenue', x: -488, z: 68, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-snr-7', name: 'Snowridge Flats', areaName: 'Snowridge Avenue', x: -488, z: 110, width: 21.6, depth: 16.8, rotationY: Math.PI * 0.5, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-snr-8', name: 'Snowridge Barn E', areaName: 'Snowridge Avenue', x: -445, z: -145, width: 21.0, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'warehouse', wallColorHex: '#8d99a6', roofColorHex: '#1f2937', accentColorHex: '#38bdf8' },
    { id: 's-x-snr-9', name: 'Snowridge Cottage E', areaName: 'Snowridge Avenue', x: -445, z: -45, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#fbbf24' },
    { id: 's-x-snr-10', name: 'Snowridge House E', areaName: 'Snowridge Avenue', x: -445, z: 45, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-snr-11', name: 'Snowridge Outpost E', areaName: 'Snowridge Avenue', x: -445, z: 145, width: 19.8, depth: 15.6, rotationY: -Math.PI * 0.5, style: 'cyber_outpost', wallColorHex: '#9aa8b8', roofColorHex: '#0f172a', accentColorHex: '#22d3ee' },

    // 12. Tundra Terrace (along x = 468)
    { id: 's-x-tnd-1', name: 'Tundra Chalet 1', areaName: 'Tundra Terrace', x: 488, z: -148, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-tnd-2', name: 'Tundra House 1', areaName: 'Tundra Terrace', x: 488, z: -108, width: 20.6, depth: 16.4, rotationY: -Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-tnd-3', name: 'Tundra Flats', areaName: 'Tundra Terrace', x: 488, z: -66, width: 21.6, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-tnd-4', name: 'Tundra Villa 1', areaName: 'Tundra Terrace', x: 488, z: -24, width: 22.0, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-tnd-5', name: 'Tundra Ruins 1', areaName: 'Tundra Terrace', x: 488, z: 24, width: 18.6, depth: 15.0, rotationY: -Math.PI * 0.5, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-tnd-6', name: 'Tundra Chalet 2', areaName: 'Tundra Terrace', x: 488, z: 68, width: 16.4, depth: 13.4, rotationY: -Math.PI * 0.5, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-tnd-7', name: 'Tundra Complex', areaName: 'Tundra Terrace', x: 488, z: 110, width: 21.8, depth: 16.8, rotationY: -Math.PI * 0.5, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-tnd-8', name: 'Tundra Depot W', areaName: 'Tundra Terrace', x: 445, z: -145, width: 21.0, depth: 16.4, rotationY: Math.PI * 0.5, style: 'warehouse', wallColorHex: '#8d99a6', roofColorHex: '#1f2937', accentColorHex: '#38bdf8' },
    { id: 's-x-tnd-9', name: 'Tundra Cottage W', areaName: 'Tundra Terrace', x: 445, z: -45, width: 16.4, depth: 13.4, rotationY: Math.PI * 0.5, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#fbbf24' },
    { id: 's-x-tnd-10', name: 'Tundra House W', areaName: 'Tundra Terrace', x: 445, z: 45, width: 20.6, depth: 16.4, rotationY: Math.PI * 0.5, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-tnd-11', name: 'Tundra Lab W', areaName: 'Tundra Terrace', x: 445, z: 145, width: 20.4, depth: 16.4, rotationY: Math.PI * 0.5, style: 'futuristic_lab', wallColorHex: '#dbe4ee', roofColorHex: '#0f172a', accentColorHex: '#22d3ee' },

    // 13. South Glacier Way (along z = 448)
    { id: 's-x-sgw-1', name: 'South Glacier Chalet 1', areaName: 'South Glacier Way', x: -205, z: 428, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-sgw-2', name: 'South Glacier House W', areaName: 'South Glacier Way', x: -162, z: 428, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-sgw-3', name: 'South Glacier Ruins W', areaName: 'South Glacier Way', x: -116, z: 428, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-sgw-4', name: 'South Glacier Villa W', areaName: 'South Glacier Way', x: -72, z: 428, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-sgw-5', name: 'South Glacier Hut M', areaName: 'South Glacier Way', x: -32, z: 428, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-sgw-6', name: 'South Glacier Complex E', areaName: 'South Glacier Way', x: 114, z: 428, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-sgw-7', name: 'South Glacier House E', areaName: 'South Glacier Way', x: 160, z: 428, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-sgw-8', name: 'South Glacier Chalet E', areaName: 'South Glacier Way', x: 204, z: 428, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#fbbf24' },
    { id: 's-x-sgw-9', name: 'South Glacier Lodge S1', areaName: 'South Glacier Way', x: -162, z: 468, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-sgw-10', name: 'South Glacier Hut S1', areaName: 'South Glacier Way', x: -118, z: 468, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-sgw-11', name: 'South Glacier Flats S', areaName: 'South Glacier Way', x: -72, z: 468, width: 21.6, depth: 16.8, rotationY: Math.PI, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-sgw-12', name: 'South Glacier Ruins S', areaName: 'South Glacier Way', x: -30, z: 468, width: 18.6, depth: 15.0, rotationY: Math.PI, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-sgw-13', name: 'South Glacier Villa S', areaName: 'South Glacier Way', x: 42, z: 468, width: 22.0, depth: 16.8, rotationY: Math.PI, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-sgw-14', name: 'South Glacier Chalet S2', areaName: 'South Glacier Way', x: 92, z: 468, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-sgw-15', name: 'South Glacier House S2', areaName: 'South Glacier Way', x: 136, z: 468, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },

    // 14. Northern Aurora Row (along z = -450)
    { id: 's-x-nar-1', name: 'Aurora Chalet W', areaName: 'Northern Aurora', x: -190, z: -470, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nar-2', name: 'Aurora House W', areaName: 'Northern Aurora', x: -148, z: -470, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-nar-3', name: 'Aurora Ruins W', areaName: 'Northern Aurora', x: -102, z: -470, width: 18.6, depth: 15.0, rotationY: 0, style: 'abandoned_building', wallColorHex: '#94a3b8', roofColorHex: '#334155', accentColorHex: '#2dd4bf' },
    { id: 's-x-nar-4', name: 'Aurora Villa W', areaName: 'Northern Aurora', x: -58, z: -470, width: 22.0, depth: 16.8, rotationY: 0, style: 'luxury_villa', wallColorHex: '#eef3f8', roofColorHex: '#1e3a5f', accentColorHex: '#22d3ee' },
    { id: 's-x-nar-5', name: 'Aurora Complex E', areaName: 'Northern Aurora', x: 42, z: -470, width: 21.8, depth: 16.8, rotationY: 0, style: 'residential_complex', wallColorHex: '#dde5ee', roofColorHex: '#334155', accentColorHex: '#22d3ee' },
    { id: 's-x-nar-6', name: 'Aurora House E', areaName: 'Northern Aurora', x: 92, z: -470, width: 20.6, depth: 16.4, rotationY: 0, style: 'huge_house', wallColorHex: '#c6d1dd', roofColorHex: '#1e3a5f', accentColorHex: '#38bdf8' },
    { id: 's-x-nar-7', name: 'Aurora Flats E', areaName: 'Northern Aurora', x: 140, z: -470, width: 21.6, depth: 16.8, rotationY: 0, style: 'apartment_block', wallColorHex: '#cbd5e1', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
    { id: 's-x-nar-8', name: 'Aurora Chalet E', areaName: 'Northern Aurora', x: 184, z: -470, width: 16.4, depth: 13.4, rotationY: 0, style: 'village_home', wallColorHex: '#b39a82', roofColorHex: '#475569', accentColorHex: '#f59e0b' },
    { id: 's-x-nar-9', name: 'Aurora Depot S', areaName: 'Northern Aurora', x: -150, z: -428, width: 21.0, depth: 16.4, rotationY: Math.PI, style: 'warehouse', wallColorHex: '#8d99a6', roofColorHex: '#1f2937', accentColorHex: '#38bdf8' },
    { id: 's-x-nar-10', name: 'Aurora Manor S', areaName: 'Northern Aurora', x: -74, z: -428, width: 20.6, depth: 16.4, rotationY: Math.PI, style: 'huge_house', wallColorHex: '#c8d3de', roofColorHex: '#1e3a5f', accentColorHex: '#60a5fa' },
    { id: 's-x-nar-11', name: 'Aurora Hut S', areaName: 'Northern Aurora', x: 74, z: -428, width: 16.4, depth: 13.4, rotationY: Math.PI, style: 'village_home', wallColorHex: '#dce4ec', roofColorHex: '#334155', accentColorHex: '#38bdf8' },
  ]),
};
