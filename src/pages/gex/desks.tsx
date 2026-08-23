import { type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import SegmentedControl from '../../components/ui/SegmentedControl';
import DeskBarSlot from '../../components/ui/DeskBarSlot';
import GammaChart from './GammaChart';
import ComplexBoard from './ComplexBoard';
import GammaRolloff from './GammaRolloff';
import ExpiryDependency from './ExpiryDependency';
import ExposureProfile from './ExposureProfile';
import RankedTargets from './RankedTargets';
import GreeksRegime from './GreeksRegime';
import VannaCharm from './VannaCharm';
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
 * expected — while the Pinpoint tab bar stays five desks rather than growing a
 * tab per read.
 */
const SubtabDesk = ({ views, ariaLabel }: { views: SubView[]; ariaLabel: string }) => {
  const [params, setParams] = useSearchParams();
  const current = views.find(v => v.key === params.get('view')) ?? views[0];
  return (
    <div className="flex flex-col gap-4">
      {/*
        The within-desk view switch rides the DESK STRIP, beside the Pinpoint
        tabs, rather than opening a second control row under it.

        It used to sit here with a `VIEW` eyebrow in front of it, sixty pixels
        below a bar that already said `PINPOINT | Gamma Levels Greeks Stress
        History` — two toolbars, both changing what you are looking at, and the
        reader left to work out which level of nav is which. On the strip the
        two levels read as one toolbar: section and desk on the left, this
        desk's own views on the right. See ui/deskBar.ts for how a routed desk
        reaches a bar its section layout renders.

        The eyebrow is gone with the row. On the strip the position IS the
        label — nothing else sits to the right of the tabs.
      */}
      <DeskBarSlot>
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
      </DeskBarSlot>
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
      { key: 'rolloff', label: 'Roll-off', node: <GammaRolloff /> },
      { key: 'dependency', label: 'Dependency', node: <ExpiryDependency /> },
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

/* No Volatility desk here. The IV surface and the density it implies moved to
   Prove It — they are model output, not a picture of dealer hedging — and
   /pinpoint/volatility redirects there. Keeping a second copy mounted under
   Pinpoint would fork the surface into two homes. */

export const StressDesk = () => (
  <SubtabDesk
    ariaLabel="Stress view"
    views={[
      { key: 'hedge', label: 'Hedge impact', node: <HedgeImpact /> },
      { key: 'fracture', label: 'Fracture', node: <Fracture /> },
    ]}
  />
);
