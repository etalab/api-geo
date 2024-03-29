const {join} = require('path')
const {keyBy} = require('lodash')
const communes = require('@etalab/decoupage-administratif/data/communes.json')
const epci = require('@etalab/decoupage-administratif/data/epci.json')
const area = require('@turf/area').default
const pointOnFeature = require('@turf/point-on-feature').default
const truncate = require('@turf/truncate').default
const bbox = require('@turf/bbox').default
const bboxPolygon = require('@turf/bbox-polygon').default
const {readGeoJSONFeatures, writeData, fixPrecision} = require('./util')

const resolution = process.env.BUILD_LOW_RESOLUTION === '1' ? '50m' : '5m'

let COMMUNES_ASSOCIEES_DELEGUEES_FEATURES_PATH = ''
if (process.env.COMMUNES_ASSOCIEES_DELEGUEES) {
  COMMUNES_ASSOCIEES_DELEGUEES_FEATURES_PATH = join(__dirname, '..', 'data', `communes-associees-deleguees-${resolution}.geojson.gz`)
}

const COMMUNES_EPCI_MATCHING = epci.reduce((acc, curr) => {
  curr.membres.forEach(membre => {
    acc[membre.code] = curr.code
  })

  return acc
}, {})

async function buildCommunesAssocieesDeleguees() {
  let communesAssocieesDelegueesFeaturesIndex = {}
  if (COMMUNES_ASSOCIEES_DELEGUEES_FEATURES_PATH) {
    const communesAssocieesDelegueesFeatures = await readGeoJSONFeatures(COMMUNES_ASSOCIEES_DELEGUEES_FEATURES_PATH)
    communesAssocieesDelegueesFeaturesIndex = keyBy(communesAssocieesDelegueesFeatures, f => f.properties.code)
  }

  const communesAssocieesDelegueesData = communes
    .filter(commune => {
      return ['commune-associee', 'commune-deleguee'].includes(commune.type)
    })
    .map(commune => {
      const communeData = {
        code: commune.code,
        type: commune.type,
        nom: commune.nom,
        chefLieu: commune.chefLieu,
        codeDepartement: commune.departement,
        codeRegion: commune.region
      }

      if (commune.code in communesAssocieesDelegueesFeaturesIndex) {
        const contour = communesAssocieesDelegueesFeaturesIndex[commune.code].geometry
        communeData.contour = contour
        communeData.surface = fixPrecision(area(contour) / 10000, 2)
        communeData.centre = truncate(pointOnFeature(contour), {precision: 4}).geometry
        const bboxCommune = bbox(communesAssocieesDelegueesFeaturesIndex[commune.code])
        const bboxPolygonCommune = bboxPolygon(bboxCommune)
        communeData.bbox = bboxPolygonCommune.geometry
      }

      if (commune.chefLieu in COMMUNES_EPCI_MATCHING) {
        communeData.codeEpci = COMMUNES_EPCI_MATCHING[commune.chefLieu]
      }

      return communeData
    })

  await writeData('communes-associees-deleguees', communesAssocieesDelegueesData)
}

module.exports = {buildCommunesAssocieesDeleguees}
