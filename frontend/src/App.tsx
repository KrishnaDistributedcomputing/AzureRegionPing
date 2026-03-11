import { useState } from 'react';
import Globe from './components/Globe';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DetailPanel from './components/DetailPanel';

export default function App() {
  const [selectedPair, setSelectedPair] = useState<{ source: string; target: string } | null>(null);

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Globe takes 70% */}
        <div className="flex-1 relative">
          <Globe onArcClick={(source, target) => setSelectedPair({ source, target })} />
          {selectedPair && (
            <DetailPanel
              source={selectedPair.source}
              target={selectedPair.target}
              onClose={() => setSelectedPair(null)}
            />
          )}
        </div>
        {/* Sidebar takes 30% */}
        <Sidebar
          onRegionClick={(source, target) => setSelectedPair({ source, target })}
        />
      </div>
    </div>
  );
}
