import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { storage } from "./storage";

// Storage-based query function (replaces API fetch)
export const getQueryFn: <T>() => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const [endpoint, ...params] = queryKey as [string, ...any[]];
    
    // Map API endpoints to storage methods
    switch (endpoint) {
      case '/api/cables':
        return await storage.getAllCables() as any;
      case '/api/circuits':
        return await storage.getAllCircuits() as any;
      case '/api/saves':
        return await storage.getAllSaves() as any;
      default:
        // For specific resource queries like /api/cables/:id
        if (endpoint.startsWith('/api/cables/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getCable(id!) as any;
        }
        if (endpoint.startsWith('/api/circuits/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getCircuit(id!) as any;
        }
        if (endpoint.startsWith('/api/saves/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getSave(id!) as any;
        }
        throw new Error(`Unknown query endpoint: ${endpoint}`);
    }
  };

// Storage-based API request (replaces fetch for mutations)
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<{ json: () => Promise<any> }> {
  // Parse the URL and method to determine which storage operation to call
  const path = url.replace(/^\/api\//, '');
  const [resource, id, ...rest] = path.split('/');
  
  try {
    let result: any;
    
    if (method === 'POST') {
      if (resource === 'cables') {
        result = await storage.createCable(data as any);
      } else if (resource === 'circuits') {
        result = await storage.createCircuit(data as any);
      } else if (resource === 'saves') {
        const { name } = data as any;
        result = await storage.createSave(name);
      }
    } else if (method === 'PATCH') {
      if (resource === 'circuits' && rest.includes('toggle-spliced')) {
        await storage.updateCircuit(id, data as any);
        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.updateCircuit(id, data as any);
        result = { success: true };
      }
    } else if (method === 'DELETE') {
      if (resource === 'cables') {
        await storage.deleteCable(id);
        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.deleteCircuit(id);
        result = { success: true };
      } else if (resource === 'saves') {
        if (id === 'load') {
          const { id: saveId } = data as any;
          await storage.loadSave(saveId);
          result = { success: true };
        } else if (url.includes('/reset')) {
          await storage.resetAllData();
          result = { success: true };
        } else {
          await storage.deleteSave(id);
          result = { success: true };
        }
      }
    }
    
    return {
      json: async () => result
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Storage operation failed');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
