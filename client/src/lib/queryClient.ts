import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Simple fetch-based query function
export const getQueryFn: <T>() => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const [endpoint] = queryKey as [string, ...any[]];
    
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${endpoint}`);
    }
    return await response.json();
  };

// Simple fetch-based API request
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<{ json: () => Promise<any> }> {
  const options: RequestInit = {
    method,
    headers: data !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: data !== undefined ? JSON.stringify(data) : undefined,
  };
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'Request failed';
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  const result = await response.json();
  return {
    json: async () => result
  };
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
