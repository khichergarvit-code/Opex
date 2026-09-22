export interface DisplayArtifact {
  id: string;
  toolName: string;
}

/** Artifacts produced during the current conversation, from tool_result.artifactIds. */
export function ArtifactsPanel({ artifacts }: { artifacts: DisplayArtifact[] }) {
  if (artifacts.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 12 }}>No artifacts yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {artifacts.map((a) => (
        <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{a.toolName}</div>
          <img
            src={`/artifacts/${a.id}`}
            alt={`Artifact from ${a.toolName}`}
            style={{ maxWidth: '100%', display: 'block' }}
            onError={(e) => {
              // Not every artifact is an image (e.g. future non-chart file
              // outputs) — fall back to a plain download link.
              e.currentTarget.style.display = 'none';
            }}
          />
          <a href={`/artifacts/${a.id}`} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      ))}
    </div>
  );
}
