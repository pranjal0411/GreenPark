from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os
import json

# Add parent directory to access green_deserts
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import green_deserts

app = FastAPI(title="GreenPark API")

# Configure CORS for Next.js frontend (which will run on port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CityRequest(BaseModel):
    city_name: str
    buffer_dist: int = 800

@app.post("/api/analyze")
def analyze_city(req: CityRequest):
    try:
        boundary = green_deserts.fetch_city_boundary(req.city_name)
        if boundary is None:
            raise HTTPException(status_code=400, detail="Failed to fetch city boundary")
        
        try:
            boundary_geom = boundary.geometry.union_all()
        except AttributeError:
            boundary_geom = boundary.unary_union
            
        parks = green_deserts.fetch_parks(boundary_geom)
        if parks is None or parks.empty:
            raise HTTPException(status_code=400, detail="No parks found")
            
        boundary_proj, parks_proj, service_area, underserved = green_deserts.calculate_green_deserts(boundary, parks, req.buffer_dist)
        
        points_df = green_deserts.generate_training_data(boundary_proj, service_area)
        model, metrics = green_deserts.train_model(points_df)
        
        # Calculate Stats
        total_area = float(boundary_proj.geometry.area.sum() / 1e6)
        served_area = float(service_area.area.sum() / 1e6)
        underserved_area_val = float(underserved.area.sum() / 1e6)
        stats = {
            "total_area_km2": total_area,
            "served_area_km2": served_area,
            "underserved_area_km2": underserved_area_val
        }
        
        # Convert GDFs to GeoJSON format (Lat/Lon)
        return {
            "metrics": metrics,
            "stats": stats,
            "geojson": {
                "boundary": json.loads(boundary_proj.to_crs(epsg=4326).to_json()),
                "parks": json.loads(parks_proj.to_crs(epsg=4326).to_json()),
                "service_area": json.loads(service_area.to_crs(epsg=4326).to_json()),
                "underserved": json.loads(underserved.to_crs(epsg=4326).to_json())
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
