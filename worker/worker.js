/**
 * Cloudflare Worker for Helha (حِلها) Store
 * Upload and serve files to/from Cloudflare R2 Bucket (sp-one via binding 'sp')
 * 
 * Worker URL: https://spyone.nonm1724.workers.dev
 * Public R2 Domain: https://pub-a9759aa27af1490f9ac3ee12ed967379.r2.dev
 */

const PUBLIC_R2_URL = "https://pub-a9759aa27af1490f9ac3ee12ed967379.r2.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-filename, x-file-type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Health check & info
      if (request.method === "GET" && (path === "/" || path === "/health")) {
        return new Response(
          JSON.stringify({
            status: "online",
            service: "Helha R2 Upload Worker (sp-one)",
            endpoints: {
              upload: "POST /upload (supports FormData with 'file' or JSON with 'image' base64)",
              file: "GET /files/:key"
            }
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      // 2. Upload endpoint
      if (request.method === "POST" && (path === "/upload" || path === "/" || path.startsWith("/upload"))) {
        const contentType = request.headers.get("content-type") || "";
        let fileData = null;
        let originalName = "";
        let mimeType = "image/jpeg";

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file) {
            return new Response(
              JSON.stringify({ success: false, error: "No file provided in form data ('file' field required)" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          fileData = await file.arrayBuffer();
          originalName = file.name || "upload.jpg";
          mimeType = file.type || "image/jpeg";
        } else if (contentType.includes("application/json")) {
          const json = await request.json();
          if (!json.image) {
            return new Response(
              JSON.stringify({ success: false, error: "Field 'image' (base64) required in JSON body" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Handle data URL (data:image/png;base64,....)
          let base64 = json.image;
          if (base64.includes(",")) {
            const parts = base64.split(",");
            const match = parts[0].match(/:(.*?);/);
            if (match) mimeType = match[1];
            base64 = parts[1];
          }
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          fileData = bytes.buffer;
          originalName = json.name || "image.jpg";
        } else {
          // Raw binary body
          fileData = await request.arrayBuffer();
          originalName = request.headers.get("x-filename") || "upload.jpg";
          mimeType = request.headers.get("x-file-type") || request.headers.get("content-type") || "image/jpeg";
        }

        // Clean extension
        const extMatch = originalName.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : (mimeType.split("/")[1] || "jpg");
        const uniqueKey = `helha_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

        // Save to R2 bucket 'sp'
        if (!env.sp) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "R2 bucket binding 'sp' is missing in worker environment settings."
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await env.sp.put(uniqueKey, fileData, {
          httpMetadata: {
            contentType: mimeType,
            cacheControl: "public, max-age=31536000"
          }
        });

        const publicUrl = `${PUBLIC_R2_URL}/${uniqueKey}`;

        return new Response(
          JSON.stringify({
            success: true,
            key: uniqueKey,
            url: publicUrl,
            workerUrl: `${url.origin}/files/${uniqueKey}`
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      // 3. Serve file directly if requested through worker
      if (request.method === "GET" && path.startsWith("/files/")) {
        const key = decodeURIComponent(path.replace("/files/", ""));
        if (!env.sp) {
          return new Response("R2 binding missing", { status: 500, headers: corsHeaders });
        }
        const object = await env.sp.get(key);
        if (!object) {
          return new Response("File not found", { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        return new Response(object.body, { headers });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || "Internal Worker Error" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
