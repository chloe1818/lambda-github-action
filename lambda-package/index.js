/**
 * A simple AWS Lambda function handler
 */
exports.handler = async (event, context) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // Default response
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from AWS Lambda!',
      timestamp: new Date().toISOString(),
      event: event
    })
  };
  
  return response;
};
