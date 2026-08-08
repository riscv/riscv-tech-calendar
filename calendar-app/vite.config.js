import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // The pipeline under test is pure JS with no DOM, so node keeps the run fast.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})