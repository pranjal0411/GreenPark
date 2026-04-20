"use client";

import React, { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { createXRStore, XR, XROrigin, useXRControllerLocomotion } from "@react-three/xr";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

interface ARMapProps {
  data: any;
}

function VRPlayerLocomotion() {
  const rigRef = React.useRef<THREE.Group>(null);
  useXRControllerLocomotion(rigRef, { speed: 10 }, { speed: 2, type: 'smooth' });

  return (
    <group ref={rigRef} position={[0, 0, 5]}>
      <XROrigin />
    </group>
  );
}

// Convert GeoJSON polygon coordinates to THREE.Shape
const createShape = (polygonCoords: any[], center: [number, number], scale: number = 200) => {
  const shape = new THREE.Shape();
  if (!polygonCoords || polygonCoords.length === 0) return shape;

  // Outer ring usually is the first array
  const ring = polygonCoords[0];
  
  ring.forEach((coord: [number, number], index: number) => {
    // Basic projection: map lon/lat to x/z planar coordinates
    const x = (coord[0] - center[0]) * scale;
    const z = -(coord[1] - center[1]) * scale; 
    
    if (index === 0) {
      shape.moveTo(x, z);
    } else {
      shape.lineTo(x, z);
    }
  });

  return shape;
};

const ExtrudedPolygon = ({ 
  feature, 
  center, 
  color, 
  height, 
  scale,
  showLabel = false
}: { 
  feature: any, 
  center: [number, number], 
  color: string, 
  height: number,
  scale: number,
  showLabel?: boolean
}) => {
  const geomType = feature.geometry.type;
  const coords = feature.geometry.coordinates;

  const shapes = useMemo(() => {
    const s: THREE.Shape[] = [];
    if (geomType === "Polygon") {
      s.push(createShape(coords, center, scale));
    } else if (geomType === "MultiPolygon") {
      coords.forEach((poly: any[]) => {
        s.push(createShape(poly, center, scale));
      });
    }
    return s;
  }, [coords, geomType, center, scale]);

  const name = showLabel ? (feature.properties?.name || feature.properties?.Name) : null;
  
  const labelPos = useMemo(() => {
    if (!name) return null;
    try {
      const firstRing = geomType === 'Polygon' ? coords[0] : coords[0][0];
      const coord = firstRing[0];
      const x = (coord[0] - center[0]) * scale;
      const shapeY = -(coord[1] - center[1]) * scale;
      // The polygon mesh is rotated -90deg on X axis. 
      // 3D Point (x, y, 0) rotated -90deg on X -> (x, 0, -y).
      // So physical 3D Z coordinate is -shapeY.
      return [x, height + 0.5, -shapeY] as [number, number, number];
    } catch(e) { return null; }
  }, [name, coords, geomType, center, scale, height]);

  return (
    <group>
      {shapes.map((shape, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <extrudeGeometry 
            args={[shape, { depth: height, bevelEnabled: false }]} 
          />
          <meshStandardMaterial color={color} transparent opacity={0.8} />
        </mesh>
      ))}
      {name && labelPos && (
        <Text
          position={labelPos}
          rotation={[-Math.PI / 4, 0, 0]}
          fontSize={0.25}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="black"
        >
          {name}
        </Text>
      )}
    </group>
  );
};

export default function ARMapVisualizer({ data }: ARMapProps) {
  const [store] = useState(() => createXRStore());

  if (!data || !data.geojson) return null;

  // Calculate generic center using the first coordinate of the boundary
  const firstCoord = data.geojson.boundary.features[0].geometry.coordinates[0][0];
  const center: [number, number] = [firstCoord[0], firstCoord[1]];

  const mapScale = 500; // Scaling factor for coordinates to fit neatly in AR footprint
  
  return (
    <div className="w-full h-[600px] relative rounded-xl overflow-hidden glass-panel">
      <div className="absolute top-4 left-4 z-10 flex gap-4">
        <button onClick={() => store.enterAR()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white shadow-lg transition-all">Enter AR</button>
        <button onClick={() => store.enterVR()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white shadow-lg transition-all">Enter VR</button>
      </div>

      <Canvas shadows camera={{ position: [0, 5, 10], fov: 50 }}>
        <XR store={store}>
          <color attach="background" args={["#0f172a"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 20, 5]} intensity={1} castShadow />
          
          <VRPlayerLocomotion />
          
          {/* Group to hold the entire map model */}
          <Suspense fallback={null}>
            <group position={[0, -1, -2]}> {/* Move slightly down and forward for AR */}
              {/* Draw City Boundary (Base) */}
              {data.geojson.boundary.features.map((feat: any, idx: number) => (
                <ExtrudedPolygon 
                  key={`bounds-${idx}`} 
                  feature={feat} 
                  center={center} 
                  color="#1e293b" 
                  height={0.1} 
                  scale={mapScale} 
                />
              ))}

              {/* Draw Underserved Areas (Red) */}
              {data.geojson.underserved.features.map((feat: any, idx: number) => (
                <ExtrudedPolygon 
                  key={`under-${idx}`} 
                  feature={feat} 
                  center={center} 
                  color="#ef4444" 
                  height={0.5} 
                  scale={mapScale} 
                />
              ))}

              {/* Draw Service Areas (Green) */}
              {data.geojson.service_area.features.map((feat: any, idx: number) => (
                <ExtrudedPolygon 
                  key={`serve-${idx}`} 
                  feature={feat} 
                  center={center} 
                  color="#10b981" 
                  height={0.3} 
                  scale={mapScale} 
                />
              ))}

              {/* Draw Parks with Labels (Darker Green) */}
              {data.geojson.parks?.features.map((feat: any, idx: number) => (
                <ExtrudedPolygon 
                  key={`park-${idx}`} 
                  feature={feat} 
                  center={center} 
                  color="#064e3b" 
                  height={0.4} 
                  scale={mapScale} 
                  showLabel={true}
                />
              ))}
              
              {/* Floating Label */}
              <Text 
                position={[0, 2, 0]} 
                color="white" 
                fontSize={0.5} 
                anchorX="center" 
                anchorY="middle"
              >
                Green Deserts Map
              </Text>
            </group>
          </Suspense>

          <OrbitControls makeDefault listenToKeyEvents={window} />
        </XR>
      </Canvas>
    </div>
  );
}
