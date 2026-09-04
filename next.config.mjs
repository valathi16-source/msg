/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
    '*.ngrok.io',
    'appealing-glowworm-disarm.ngrok-free.dev'
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:4000/socket.io/:path*',
      },
    ];
  },
};

export default nextConfig;
