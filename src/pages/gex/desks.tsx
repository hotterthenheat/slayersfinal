import { type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import SegmentedControl from '../../components/ui/SegmentedControl';
import GammaChart from './GammaChart';
import ComplexBoard from './ComplexBoard';
import ExposureProfile from './ExposureProfile';
import RankedTargets from './RankedTargets';
import GreeksRegime from './GreeksRegime';
import VannaCharm from './VannaCharm';
import VolLab from './VolLab';
import StatePriceDensity from '../../components/gex/StatePriceDensity';
import HedgeImpact from './HedgeImpact';
import Fracture from '../fracture/Fracture';

interface SubView {
  key: string;
  label: string;
  node: ReactNode;
}

/**
 * A consolidated Pinpoint desk. Two complementary reads share one desk via a
 * segmented sub-toggle synced to the `?view=` query param, so old deep links and
 * the redirects from the retired sub-routes land on the exact pane a trader
 * expected — while the Pinpoint tab bar stays six desks, not eleven.
 */
const SubtabDesk = ({ views, ariaLabel }: { views: SubView[]; ariaLabel: string }) => {
  const [params, setParams] = useSearchParams();
  const current = views.find(v => v.key === params.get('view')) ?? views[0];
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        ariaLabel={ariaLabel}
        options={views.map(v => ({ value: v.key, label: v.label }))}
        value={current.key}
        onChange={key => {
          const next = new URLSearchParams(params);
          next.set('view', key);
          setParams(next, { replace: true });
        }}
      />
      {current.node}
    </div>
  );
};

export const GammaDesk = () => (
  <SubtabDesk
    ariaLabel="Gamma scope"
    views={[
      { key: 'this', label: 'This ticker', node: <GammaChart /> },
      { key: 'complex', label: 'Complex', node: <ComplexBoard /> },
    ]}
  />
);

export const LevelsDesk = () => (
  <SubtabDesk
    ariaLabel="Levels view"
    views={[
      { key: 'exposure', label: 'Exposure profile', node: <ExposureProfile /> },
      { key: 'ranked', label: 'Ranked targets', node: <RankedTargets /> },
    ]}
  />
);

export const GreeksDesk = () => (
  <SubtabDesk
    ariaLabel="Greeks view"
    views={[
      { key: 'matrix', label: 'Matrix & regime', node: <GreeksRegime /> },
      { key: 'migration', label: 'Vanna & charm', node: <VannaCharm /> },
    ]}
  />
);

export const VolatilityDesk = () => (
  <SubtabDesk
    ariaLabel="Volatility view"
    views={[
      { key: 'surface', label: 'IV surface', node: <VolLab /> },
      { key: 'density', label: 'Risk-neutral density', node: <StatePriceDensity /> },
    ]}
  />
);

export const StressDesk = () => (
  <SubtabDesk
    ariaLabel="Stress view"
    views={[
      { key: 'hedge', label: 'Hedge impact', node: <HedgeImpact /> },
      { key: 'fracture', label: 'Fracture', node: <Fracture /> },
    ]}
  />
);
