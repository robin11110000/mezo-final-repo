/** @type {import('next').NextConfig} */
module.exports={distDir:process.env.VERCEL?'.next':process.env.NODE_ENV==='production'?'.next-production':'.next',experimental:{outputFileTracingRoot:__dirname},async redirects(){return [{source:'/',destination:'/capital',permanent:false}];}};
