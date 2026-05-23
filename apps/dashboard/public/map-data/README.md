# Realtime Map Data

`natural-earth-countries-50m.json` is generated from the official Natural Earth
Admin 0 Countries 1:50m dataset, version 5.1.1.

Source:
https://www.naturalearthdata.com/downloads/50m-cultural-vectors/

Generation notes:
- Downloaded `ne_50m_admin_0_countries.zip`
- Converted the shapefile to GeoJSON with `shp2json`
- Kept only country name and ISO properties
- Converted to TopoJSON and quantized to reduce dashboard bundle size
