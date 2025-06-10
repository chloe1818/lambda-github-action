exports.handler = async (event, context) => {
  // Log "hello world" to CloudWatch
  console.log("hello world");
  
  // Return a successful response
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello World from AWS Lambda",
      input: event
    }),
  };
  
  return response;
};
