import WebSocket from "ws";

interface Dependency {
  dependents: Set<string>;
  dependencies: Set<string>;
  isHmrEnabled: boolean;
  needsReplacement: boolean;
}

export class EsmHmrEngine {
  clients: Set<WebSocket> = new Set();
  dependencyTree = new Map<string, Dependency>();

  constructor() {
    const socket = new WebSocket.Server({ port: 12321 });
    socket.on("connection", (client) => this.connectClient(client));
  }

  createEntry(sourceUrl: string) {
    const newEntry: Dependency = {
      dependencies: new Set(),
      dependents: new Set(),
      needsReplacement: false,
      isHmrEnabled: false,
    };
    this.dependencyTree.set(sourceUrl, newEntry);
    return newEntry;
  }

  getEntry(sourceUrl: string, createIfNotFound = false) {
    const result = this.dependencyTree.get(sourceUrl);
    if (result) {
      return result;
    }
    if (createIfNotFound) {
      return this.createEntry(sourceUrl);
    }
    return null;
  }

  setEntry(sourceUrl: string, imports: string[], isHmrEnabled: boolean) {
    const result = this.getEntry(sourceUrl, true)!;
    const outdatedDependencies = new Set(result.dependencies);
    result.isHmrEnabled = isHmrEnabled;
    for (const importUrl of imports) {
      this.addRelationship(sourceUrl, importUrl);
      outdatedDependencies.delete(importUrl);
    }
    for (const importUrl of outdatedDependencies) {
      this.removeRelationship(sourceUrl, importUrl);
    }
  }

  removeRelationship(sourceUrl: string, importUrl: string) {
    let importResult = this.getEntry(importUrl);
    importResult && importResult.dependents.delete(sourceUrl);
    const sourceResult = this.getEntry(sourceUrl);
    sourceResult && sourceResult.dependencies.delete(importUrl);
  }

  addRelationship(sourceUrl: string, importUrl: string) {
    if (importUrl !== sourceUrl) {
      let importResult = this.getEntry(importUrl, true)!;
      importResult.dependents.add(sourceUrl);
      const sourceResult = this.getEntry(sourceUrl, true)!;
      sourceResult.dependencies.add(importUrl);
    }
  }

  markEntryForReplacement(entry: Dependency, state: boolean) {
    entry.needsReplacement = state;
  }

  broadcastMessage(data: object) {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      } else {
        this.disconnectClient(client);
      }
    });
  }

  connectClient(client: WebSocket) {
    this.clients.add(client);
  }

  disconnectClient(client: WebSocket) {
    client.terminate();
    this.clients.delete(client);
  }

  disconnectAllClients() {
    for (const client of this.clients) {
      this.disconnectClient(client);
    }
  }
}
