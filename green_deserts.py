
import osmnx as ox
import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.ops import unary_union
from shapely.geometry import Point
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, recall_score, precision_score, f1_score
import matplotlib.pyplot as plt

def fetch_city_boundary(city_name="New Delhi, India"):
    print(f"Fetching boundary for {city_name}...")
    try:
        boundary = ox.geocode_to_gdf(city_name)
        return boundary
    except Exception as e:
        print(f"Error fetching boundary: {e}")
        return None

def fetch_parks(polygon):
    print("Fetching parks from OSM...")
    tags = {'leisure': ['park', 'garden', 'nature_reserve'], 'landuse': ['grass', 'forest', 'recreation_ground']}
    try:
        parks = ox.features_from_polygon(polygon, tags)
        return parks
    except Exception as e:
        print(f"Error fetching parks: {e}")
        return None

def project_gdf(gdf):
    if gdf.crs.is_geographic:
        # Use a projected CRS for accurate buffer calculation (meters)
        # EPSG:3857 is Web Mercator, good for general visualization buffers
        # For Delhi specifically, EPSG:32643 (UTM 43N) is more accurate, but 3857 is safer globally
        return gdf.to_crs(epsg=3857) 
    return gdf

def calculate_green_deserts(boundary, parks, buffer_dist=800):
    print(f"Calculating Green Deserts with {buffer_dist}m buffer...")
    
    # Project to metric CRS
    boundary_proj = project_gdf(boundary)
    parks_proj = project_gdf(parks)
    
    # Create service area (buffer around parks)
    # Use unary_union to merge overlapping buffers
    park_buffers = parks_proj.geometry.buffer(buffer_dist)
    service_area = unary_union(park_buffers)
    
    # Create Service Area GDF
    service_area_gdf = gpd.GeoDataFrame(geometry=[service_area], crs=boundary_proj.crs)
    
    # Calculate Underserved Area (City - Service Area)
    city_geometry = unary_union(boundary_proj.geometry)
    underserved_area = city_geometry.difference(service_area)
    
    underserved_gdf = gpd.GeoDataFrame(geometry=[underserved_area], crs=boundary_proj.crs)
    
    return boundary_proj, parks_proj, service_area_gdf, underserved_gdf

def generate_training_data(boundary_proj, service_area_gdf, num_points=2000):
    print("Generating training data for Random Forest...")
    
    # Generate random points within the city boundary
    minx, miny, maxx, maxy = boundary_proj.total_bounds
    points = []
    
    while len(points) < num_points:
        x = np.random.uniform(minx, maxx)
        y = np.random.uniform(miny, maxy)
        point = gpd.points_from_xy([x], [y])
        if boundary_proj.geometry.contains(point[0]).any():
            points.append(point[0])
            
    points_gdf = gpd.GeoDataFrame(geometry=points, crs=boundary_proj.crs)
    
    # Label points: 0 = Served (inside buffer), 1 = Underserved (Green Desert)
    # Using spatial join or checking intersection
    # Check if point is within service area
    points_gdf['is_served'] = points_gdf.geometry.apply(lambda g: service_area_gdf.geometry.contains(g).any())
    points_gdf['label'] = points_gdf['is_served'].apply(lambda x: 0 if x else 1) # 1 for Deprived/Underserved
    
    # Feature Engineering (simplified for demo)
    # 1. Coordinates (Lat/Lon or X/Y) - spatial proxy
    points_gdf['x'] = points_gdf.geometry.x
    points_gdf['y'] = points_gdf.geometry.y
    
    return points_gdf

def train_model(points_gdf):
    print("Training Random Forest Classifier...")
    
    X = points_gdf[['x', 'y']] # Simple spatial features for now
    y = points_gdf['label']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    y_pred = clf.predict(X_test)
    
    metrics = {
        "Accuracy": accuracy_score(y_test, y_pred),
        "Precision": precision_score(y_test, y_pred),
        "Recall": recall_score(y_test, y_pred),
        "F1 Score": f1_score(y_test, y_pred)
    }
    
    return clf, metrics

if __name__ == "__main__":
    # Test execution
    boundary = fetch_city_boundary("New Delhi, India") # Using New Delhi for faster testing
    parks = fetch_parks(boundary.unary_union)
    
    boundary_proj, parks_proj, service_area, underserved = calculate_green_deserts(boundary, parks)
    
    print(f"Service Area: {service_area.area.sum() / 1e6:.2f} km2")
    print(f"Underserved Area: {underserved.area.sum() / 1e6:.2f} km2")
    
    points_df = generate_training_data(boundary_proj, service_area)
    model, metrics = train_model(points_df)
    
    print("Model Metrics:", metrics)
