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
        cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
        os.makedirs(cache_dir, exist_ok=True)
        # Create a safe filename by removing spaces and commas
        safe_city_name = req.city_name.replace(" ", "_").replace(",", "")
        cache_file = os.path.join(cache_dir, f"{safe_city_name}_{req.buffer_dist}.json")

        if os.path.exists(cache_file):
            print(f"Returning cached data for {req.city_name}")
            with open(cache_file, 'r') as f:
                return json.load(f)

        print(f"Calculating data for {req.city_name} (No cache found)...")
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
        response_data = {
            "metrics": metrics,
            "stats": stats,
            "geojson": {
                "boundary": json.loads(boundary_proj.to_crs(epsg=4326).to_json()),
                "parks": json.loads(parks_proj.to_crs(epsg=4326).to_json()),
                "service_area": json.loads(service_area.to_crs(epsg=4326).to_json()),
                "underserved": json.loads(underserved.to_crs(epsg=4326).to_json())
            }
        }

        # Save to cache
        try:
            with open(cache_file, 'w') as f:
                json.dump(response_data, f)
        except Exception as e:
            print(f"Warning: Failed to save cache file: {e}")

        return response_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
