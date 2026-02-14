import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth/index";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
