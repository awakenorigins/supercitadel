import { Hono } from 'hono';
export function createQldnSalesPlusRoutes(){ const app=new Hono(); app.get('/health',c=>c.json({ok:true,module:'qldn-sales-plus'})); return app; }
export default createQldnSalesPlusRoutes;
