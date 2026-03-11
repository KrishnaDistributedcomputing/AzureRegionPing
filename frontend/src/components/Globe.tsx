import { useEffect, useRef } from 'react';
import GlobeGL, { GlobeInstance } from 'globe.gl';
import { usePingStore } from '../store/pingStore';

interface GlobeProps {
  onArcClick: (source: string, target: string) => void;
}

export default function Globe({ onArcClick }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const { regions, arcs, status } = usePingStore();

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;
    
    const globe = new GlobeGL(containerRef.current)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#38bdf8')
      .atmosphereAltitude(0.15)
      // Region points
      .pointsData([])
      .pointLat('lat')
      .pointLng('lng')
      .pointColor('color')
      .pointAltitude(0.01)
      .pointRadius(0.4)
      .pointLabel('label')
      // Arcs
      .arcsData([])
      .arcStartLat('startLat')
      .arcStartLng('startLng')
      .arcEndLat('endLat')
      .arcEndLng('endLng')
      .arcColor('color')
      .arcAltitudeAutoScale(0.4)
      .arcStroke(0.5)
      .arcDashLength(0.6)
      .arcDashGap(0.3)
      .arcDashAnimateTime(2000)
      // Labels for landed arcs
      .labelsData([])
      .labelLat('lat')
      .labelLng('lng')
      .labelText('text')
      .labelSize(1.2)
      .labelColor(() => '#e2e8f0')
      .labelDotRadius(0)
      .labelAltitude(0.02);

    // Set initial camera position
    globe.pointOfView({ lat: 30, lng: -20, altitude: 2.5 });

    // Auto-rotate when idle
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;

    // Arc click handler
    globe.onArcClick((arc: { source?: string; target?: string }) => {
      if (arc.source && arc.target) {
        onArcClick(arc.source, arc.target);
      }
    });

    globeRef.current = globe;

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && globeRef.current) {
        globeRef.current.width(containerRef.current.clientWidth);
        globeRef.current.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [onArcClick]);

  // Update region points
  useEffect(() => {
    if (!globeRef.current) return;

    const pointsData = regions.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      color: '#38bdf8',
      label: r.displayName,
      id: r.id,
    }));

    globeRef.current.pointsData(pointsData);
  }, [regions]);

  // Update arcs with animation
  useEffect(() => {
    if (!globeRef.current) return;

    const arcData = arcs.map((arc) => ({
      ...arc,
      // Animating arcs get dash animation; landed arcs are solid
      arcDashLength: arc.animating ? 0.6 : undefined,
      arcDashGap: arc.animating ? 0.3 : 0,
      arcDashAnimateTime: arc.animating ? 2000 : 0,
    }));

    globeRef.current.arcsData(arcData);

    // Generate labels for landed arcs
    const labels = arcs
      .filter((a) => !a.animating && a.latencyMs)
      .map((a) => ({
        lat: (a.startLat + a.endLat) / 2,
        lng: (a.startLng + a.endLng) / 2,
        text: `${Math.round(a.latencyMs!)}ms`,
      }));

    globeRef.current.labelsData(labels);
  }, [arcs]);

  // Stop auto-rotate during testing
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = status === 'idle';
  }, [status]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}
