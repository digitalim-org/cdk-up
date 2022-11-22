function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/" || uri === "") {
    request.uri = "/index.html";
  } else if (uri.endsWith("/")) {
    request.uri = request.uri.slice(0, -1) + ".html";
  } else if (!uri.includes(".")) {
    request.uri += ".html";
  }

  return request;
}
