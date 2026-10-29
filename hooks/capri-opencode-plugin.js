// capri-opencode-plugin: OpenCode -> Capri. Installed in ~/.config/opencode/plugins/capri.js by
// scripts/install-opencode-hooks.js. Observe only: nothing here changes a prompt, a tool or an answer.

const PORT = Number(process.env.CAPRI_PORT) || 47823;

// The tool names Capri knows, and the fields it reads.
const TOOLS = {
  bash: 'Bash', shell: 'Bash', read: 'Read', edit: 'Edit', write: 'Write', patch: 'Edit',
  grep: 'Grep', glob: 'Glob', list: 'LS', webfetch: 'WebFetch', websearch: 'WebSearch',
  task: 'Task', skill: 'Skill', todowrite: 'TodoWrite', todoread: 'TodoRead', question: 'AskUserQuestion',
};

const clip = (text, max) => (typeof text === 'string' && text.length > max ? `${text.slice(0, max)}…` : text);

function tool(evt) {
  const input = { ...(evt.input || {}) };
  if (input.filePath) input.file_path = input.filePath; // opencode spells it like this
  if (Array.isArray(input.filePaths)) input.file_paths = input.filePaths;
  return { tool_name: TOOLS[evt.tool] || evt.tool, tool_input: input, tool_use_id: evt.id };
}

function send(evt) {
  const body = JSON.stringify({ ...evt, session_id: `opencode:${evt.session_id || 'default'}` });
  // Capri may be closed: never wait on it, never let it slow a tool down
  void fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    body,
    signal: AbortSignal.timeout(800),
  }).catch(() => {});
}

export default {
  id: 'capri',
  async setup(ctx) {
    const cwd = ctx.location.directory;
    const last = new Map(); // sessionID -> its last answer, for the "done" line
    const busy = new Set(); // sessions she was told are working
    const controller = new AbortController();

    const finish = (sessionID, event = {}) => {
      if (!busy.has(sessionID)) return;
      busy.delete(sessionID);
      const reply = last.get(sessionID);
      last.delete(sessionID);
      send({ hook_event_name: 'Stop', session_id: sessionID, cwd, last_assistant_message: reply, ...event });
    };

    await ctx.session.hook('prompt', (event) => {
      try {
        busy.add(event.sessionID);
        send({ hook_event_name: 'UserPromptSubmit', session_id: event.sessionID, cwd, prompt: clip(event.prompt.text, 280) });
      } catch {}
    });

    await ctx.tool.hook('execute.before', (event) => {
      try {
        send({ hook_event_name: 'PreToolUse', session_id: event.sessionID, cwd, ...tool(event) });
      } catch {}
    });

    await ctx.tool.hook('execute.after', (event) => {
      try {
        const failed = event.status === 'error';
        send({
          hook_event_name: failed ? 'PostToolUseFailure' : 'PostToolUse',
          session_id: event.sessionID,
          cwd,
          ...tool(event),
          ...(failed && { error: clip(String(event.error?.message || event.error || ''), 280) }),
        });
      } catch {}
    });

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        try {
          const data = event.data || {};
          if (event.type === 'session.text.ended') {
            if (data.text) last.set(data.sessionID, clip(data.text, 6000));
          } else if (event.type === 'session.created') {
            send({ hook_event_name: 'SessionStart', session_id: data.sessionID, cwd, session_title: data.title, source: 'startup' });
          } else if (event.type === 'session.execution.started') {
            busy.add(data.sessionID);
          } else if (event.type === 'session.step.ended') {
            // a step that did not end on tool calls is the end of the turn: this is when she stops
            if (data.finish && data.finish !== 'tool-calls') finish(data.sessionID);
          } else if (event.type === 'session.execution.succeeded') {
            finish(data.sessionID);
          } else if (event.type === 'session.idle') {
            finish(data.sessionID); // in case no execution event came through
          } else if (event.type === 'permission.asked') {
            const what = [data.action, ...(data.resources || [])].filter(Boolean).join(': ');
            send({
              hook_event_name: 'Notification', session_id: data.sessionID, cwd, notification_type: 'permission_prompt',
              message: data.message || `OpenCode needs approval: ${what || 'a tool'}`,
            });
          } else if (event.type === 'session.execution.failed') {
            busy.delete(data.sessionID);
            last.delete(data.sessionID);
            send({ hook_event_name: 'StopFailure', session_id: data.sessionID, cwd, error: clip(String(data.error?.message || 'failed'), 280) });
          } else if (event.type === 'session.execution.interrupted') {
            busy.delete(data.sessionID);
            last.delete(data.sessionID);
            send({ hook_event_name: 'Interrupt', session_id: data.sessionID, cwd });
          } else if (event.type === 'session.deleted') {
            busy.delete(data.sessionID);
            last.delete(data.sessionID);
            send({ hook_event_name: 'SessionEnd', session_id: data.sessionID, cwd, reason: 'other' });
          }
        } catch {}
      }
    })().catch(() => {});

    return () => controller.abort();
  },
};
