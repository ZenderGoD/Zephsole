import { httpRouter } from "convex/server";
import { createAuth } from "./auth";
import { authComponent } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth as any);

export default http;
