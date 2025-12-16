import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';

interface AgentInfo {
  id: string;
  ws: WebSocket;
  models: string[];
  status: 'idle' | 'busy';
  lastHeartbeat: Date;
  activeJobs: Set<string>;
}

interface JobRequest {
  jobId: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  options?: any;
}

interface TokenEvent {
  jobId: string;
  token: string;
  done: boolean;
  agentId: string;
  reasoning?: string;
}

export class AgentConnectionManager extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 10000);
  }

  registerAgent(nodeId: string, ws: WebSocket, models: string[] = []) {
    const existingAgent = this.agents.get(nodeId);
    if (existingAgent) {
      existingAgent.ws.close();
    }

    const agentInfo: AgentInfo = {
      id: nodeId,
      ws,
      models,
      status: 'idle',
      lastHeartbeat: new Date(),
      activeJobs: new Set(),
    };

    this.agents.set(nodeId, agentInfo);
    console.log(`Agent ${nodeId} registered via WebSocket with models:`, models);
    this.emit('agent:registered', agentInfo);

    ws.send(JSON.stringify({
      type: 'registered',
      nodeId,
      timestamp: Date.now(),
    }));
  }

  handleAgentMessage(nodeId: string, message: any) {
    const agent = this.agents.get(nodeId);
    if (!agent) return;

    switch (message.type) {
      case 'heartbeat':
        agent.lastHeartbeat = new Date();
        break;

      case 'token':
        this.emit('token', {
          jobId: message.jobId,
          token: message.token,
          done: message.done,
          agentId: nodeId,
          reasoning: message.reasoning,
        } as TokenEvent);
        break;

      case 'job_complete':
        agent.activeJobs.delete(message.jobId);
        if (agent.activeJobs.size === 0) {
          agent.status = 'idle';
        }
        this.emit('job:complete', { jobId: message.jobId, agentId: nodeId });
        break;

      case 'job_error':
        agent.activeJobs.delete(message.jobId);
        if (agent.activeJobs.size === 0) {
          agent.status = 'idle';
        }
        this.emit('job:error', {
          jobId: message.jobId,
          error: message.error,
          agentId: nodeId,
        });
        break;

      case 'status':
        agent.status = message.status;
        break;
    }
  }

  removeAgent(nodeId: string) {
    const agent = this.agents.get(nodeId);
    if (agent) {
      for (const jobId of agent.activeJobs) {
        this.emit('job:error', {
          jobId,
          error: 'Agent disconnected',
          agentId: nodeId,
        });
      }
      this.agents.delete(nodeId);
      console.log(`Agent ${nodeId} disconnected`);
      this.emit('agent:disconnected', nodeId);
    }
  }

  private checkHeartbeats() {
    const now = Date.now();
    const timeout = 60000;

    for (const [nodeId, agent] of this.agents.entries()) {
      const timeSinceHeartbeat = now - agent.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > timeout) {
        console.log(`Agent ${nodeId} timed out (no heartbeat for ${timeSinceHeartbeat}ms)`);
        agent.ws.close();
        this.removeAgent(nodeId);
      }
    }
  }

  submitJob(job: JobRequest): { submitted: boolean; agentId?: string } {
    const availableAgent = Array.from(this.agents.values()).find(
      agent =>
        agent.status === 'idle' &&
        (agent.models.length === 0 || agent.models.includes(job.model))
    );

    if (!availableAgent) {
      return { submitted: false };
    }

    availableAgent.ws.send(JSON.stringify({
      type: 'job',
      jobId: job.jobId,
      model: job.model,
      messages: job.messages,
      options: job.options,
    }));

    availableAgent.activeJobs.add(job.jobId);
    availableAgent.status = 'busy';

    console.log(`Job ${job.jobId} pushed to agent ${availableAgent.id} via WebSocket`);

    return { submitted: true, agentId: availableAgent.id };
  }

  getAgent(nodeId: string): AgentInfo | undefined {
    return this.agents.get(nodeId);
  }

  isAgentConnected(nodeId: string): boolean {
    const agent = this.agents.get(nodeId);
    return agent !== undefined && agent.ws.readyState === WebSocket.OPEN;
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getIdleAgentCount(): number {
    return Array.from(this.agents.values()).filter(a => a.status === 'idle').length;
  }

  getConnectedAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  close() {
    clearInterval(this.heartbeatInterval);
    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    this.agents.clear();
  }
}

export const agentManager = new AgentConnectionManager();
