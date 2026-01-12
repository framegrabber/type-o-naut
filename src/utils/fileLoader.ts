export async function loadFileAsJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          reject(new Error('File content is not text'));
          return;
        }
        resolve(JSON.parse(content));
      } catch (err) {
        reject(new Error(`Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function loadFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') {
        reject(new Error('File content is not text'));
        return;
      }
      resolve(content);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function loadJsonFromUrl(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    throw new Error(
      `Failed to load from URL: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function loadTextFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (err) {
    throw new Error(
      `Failed to load from URL: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export function getQueryParam(param: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}
