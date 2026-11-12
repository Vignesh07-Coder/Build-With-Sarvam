import { SessionStatus } from '../components/SessionStatus';
import { Workspace } from '../components/workspace/Workspace';
import { fixtureNodes, fixtureSource, fixtureSourceBody, fixtureStamina } from '../lib/fixtures/workspace-fixtures';

export default function HomePage() {
  return (
    <div className="relative h-screen">
      <SessionStatus />
      <Workspace
        source={fixtureSource}
        sourceBody={fixtureSourceBody}
        initialNodes={fixtureNodes}
        initialStamina={fixtureStamina}
      />
    </div>
  );
}
