# Mr Mushakk data files

All transport and mandal data is stored as plain JSON. There is **no live tracking and no AI**.

## Easiest method: Data Manager

Open `data-manager.html` (or click **Data Manager** in the main site).

1. Click **Connect project folder**.
2. Select the main `Mr-Mushakk` folder.
3. Choose Local trains / BEST buses / Metro / Fares / Ganpati / Devi.
4. Fill the form and click **Add record**.
5. Click **Save to project**.
6. For a mandal photo, choose the image in the form. It is copied to `data/images/` and the JSON stores the relative path.
7. Re-run `npm run validate` and `npm run build` before deployment.

If direct folder access is unavailable, use **Download JSON** and replace the matching file in `data/` manually.

## Google Maps

For mandals, `mapsUrl` is optional. If it is blank, Mr Mushakk automatically creates a Google Maps search URL from the mandal name + location. You can also paste a more exact Google Maps URL into `mapsUrl`.

Example:
```json
"mapsUrl": "https://www.google.com/maps/search/?api=1&query=Lalbaugcha+Raja%2C+Lalbaug%2C+Mumbai"
```

Google Maps URLs do not require a Maps API key.

## Record formats

### Local train
```json
{
  "id":"cst-001",
  "line":"Central",
  "service":"Fast",
  "from":"CSMT",
  "to":"Kalyan",
  "departure":"08:10",
  "arrival":"09:02",
  "days":"Mon-Sun",
  "direction":"Kalyan",
  "type":"Fast",
  "stops":[
    {"station":"CSMT","time":"08:10"},
    {"station":"Dadar","time":"08:19"},
    {"station":"Ghatkopar","time":"08:38"}
  ],
  "verified":true,
  "source":"Official timetable/source"
}
```

### BEST bus / Metro frequency
```json
{
  "id":"bus-001",
  "route":"123",
  "from":"Bhandup Station",
  "to":"Mulund",
  "first":"06:00",
  "last":"22:00",
  "frequency_min":15,
  "travel_min":25,
  "days":"Mon-Sun",
  "verified":true,
  "source":"Official timetable/source"
}
```

For Metro, use `line` as needed, for example `"line":"Metro Line 1"`.

### Fare
```json
{
  "mode":"Local Train",
  "from":"Bhandup",
  "to":"Dadar",
  "fare":10,
  "verified":true,
  "source":"Official fare source"
}
```

### Ganpati / Devi mandal
```json
{
  "id":"ganpati-001",
  "name":"Example Mandal",
  "area":"Lalbaug",
  "location":"Lalbaug, Mumbai",
  "nearest":"Currey Road",
  "mapsUrl":"https://www.google.com/maps/search/?api=1&query=Example+Mandal%2C+Lalbaug%2C+Mumbai",
  "photo":"images/example-mandal.jpg",
  "latitude":18.99,
  "longitude":72.83,
  "locationVerified":true,
  "source":"Verified source",
  "sourceUrl":"https://example.com"
}
```

`photo` can be a local path such as `images/example-mandal.jpg` or a direct image URL.

## Verification rule

Only set `verified: true` when you have actually checked the timetable/fare against a reliable source. The app hides unverified transport rows unless Demo mode is enabled.
