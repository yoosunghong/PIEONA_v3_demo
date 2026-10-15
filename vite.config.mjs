import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/socket.io': { target: 'http://127.0.0.1:3000', ws: true }, '/resource': 'http://127.0.0.1:3000' } },
  build: { chunkSizeWarningLimit: 900, rollupOptions: { output: { manualChunks: { three: ['three', 'three/addons/loaders/FBXLoader.js', 'three/addons/utils/SkeletonUtils.js'], react: ['react', 'react-dom'] } } } }
});
