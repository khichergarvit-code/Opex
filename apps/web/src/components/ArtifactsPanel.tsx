import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';

export interface DisplayArtifact {
  id: string;
  toolName: string;
}

/** Artifacts produced during the current conversation, from tool_result.artifactIds. */
export function ArtifactsPanel({ artifacts }: { artifacts: DisplayArtifact[] }) {
  if (artifacts.length === 0) {
    return <EmptyState title="No artifacts yet" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {artifacts.map((a) => (
        <Card key={a.id} padded={false} className="p-3">
          <div className="mb-1.5 text-xs text-gray-400">{a.toolName}</div>
          <img
            src={`/artifacts/${a.id}`}
            alt={`Artifact from ${a.toolName}`}
            className="block max-w-full rounded-lg"
            onError={(e) => {
              // Not every artifact is an image (e.g. future non-chart file
              // outputs) — fall back to a plain download link.
              e.currentTarget.style.display = 'none';
            }}
          />
          <a href={`/artifacts/${a.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:underline">
            Open
          </a>
        </Card>
      ))}
    </div>
  );
}
