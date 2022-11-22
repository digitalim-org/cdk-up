import { Callback, CloudFrontResponseEvent, Context } from "aws-lambda";

export function handler(
  event: CloudFrontResponseEvent,
  _context: Context,
  callback: Callback
) {
  const { request, response } = event.Records[0].cf;
  const { headers } = response;

  headers["x-foo"] = [
    {
      key: "X-Foo",
      value: "bar",
    },
  ];

  headers["x-baz"] = [
    {
      key: "X-Baz",
      value: "quux",
    },
  ];

  callback(null, response);
}
