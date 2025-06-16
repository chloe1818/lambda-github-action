const core = require('@actions/core');

// Our deepEqual implementation
function deepEqual(obj1, obj2) {
  // Check if both arguments are objects
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  // Handle arrays
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }
    
    // Compare each element
    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) {
        return false;
      }
    }
    
    return true;
  }
  
  // Handle objects
  if (Array.isArray(obj1) !== Array.isArray(obj2)) {
    return false;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  // Check if all keys in obj1 exist in obj2 and have the same values
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  
  return true;
}

// Basic test cases
console.log("Testing primitive values:");
console.log("null equals null:", deepEqual(null, null)); // true
console.log("null equals undefined:", deepEqual(null, undefined)); // false
console.log("1 equals 1:", deepEqual(1, 1)); // true
console.log("1 equals '1':", deepEqual(1, '1')); // false
console.log("'hello' equals 'hello':", deepEqual('hello', 'hello')); // true
console.log("'hello' equals 'world':", deepEqual('hello', 'world')); // false

console.log("\nTesting arrays:");
console.log("[] equals []:", deepEqual([], [])); // true
console.log("[1,2,3] equals [1,2,3]:", deepEqual([1,2,3], [1,2,3])); // true
console.log("[1,2,3] equals [1,2,4]:", deepEqual([1,2,3], [1,2,4])); // false
console.log("[1,2,3] equals [1,2]:", deepEqual([1,2,3], [1,2])); // false

console.log("\nTesting simple objects:");
console.log("{a:1} equals {a:1}:", deepEqual({a:1}, {a:1})); // true
console.log("{a:1} equals {a:2}:", deepEqual({a:1}, {a:2})); // false
console.log("{a:1} equals {b:1}:", deepEqual({a:1}, {b:1})); // false
console.log("{a:1,b:2} equals {b:2,a:1}:", deepEqual({a:1,b:2}, {b:2,a:1})); // true

console.log("\nTesting nested objects:");
const obj1 = {
  a: 1,
  b: {
    c: 2,
    d: [3, 4, 5]
  }
};
const obj2 = {
  a: 1,
  b: {
    c: 2,
    d: [3, 4, 5]
  }
};
const obj3 = {
  a: 1,
  b: {
    c: 2,
    d: [3, 4, 6]
  }
};
console.log("Complex object equals itself:", deepEqual(obj1, obj2)); // true
console.log("Complex object differs in nested array:", deepEqual(obj1, obj3)); // false

// AWS Lambda specific test cases
console.log("\nTesting Lambda specific objects:");
const lambdaConfig1 = {
  FunctionName: "test-function",
  Role: "arn:aws:iam::123456789012:role/lambda-role",
  Runtime: "nodejs20.x",
  VpcConfig: {
    SubnetIds: ["subnet-123", "subnet-456"],
    SecurityGroupIds: ["sg-123"]
  },
  Environment: {
    Variables: {
      API_KEY: "secret-key",
      ENVIRONMENT: "test"
    }
  },
  Tags: {
    Project: "LambdaGitHubAction",
    Environment: "Test"
  }
};

const lambdaConfig2 = {
  FunctionName: "test-function",
  Role: "arn:aws:iam::123456789012:role/lambda-role",
  Runtime: "nodejs20.x",
  VpcConfig: {
    SubnetIds: ["subnet-123", "subnet-456"],
    SecurityGroupIds: ["sg-123"]
  },
  Environment: {
    Variables: {
      API_KEY: "secret-key",
      ENVIRONMENT: "test"
    }
  },
  Tags: {
    Project: "LambdaGitHubAction",
    Environment: "Test"
  }
};

const lambdaConfig3 = {
  FunctionName: "test-function",
  Role: "arn:aws:iam::123456789012:role/lambda-role",
  Runtime: "nodejs20.x",
  VpcConfig: {
    SubnetIds: ["subnet-123", "subnet-456"],
    SecurityGroupIds: ["sg-789"] // Changed security group
  },
  Environment: {
    Variables: {
      API_KEY: "new-key", // Changed key
      ENVIRONMENT: "test"
    }
  },
  Tags: {
    Project: "LambdaGitHubAction",
    Environment: "Test"
  }
};

console.log("Lambda configs are equal:", deepEqual(lambdaConfig1, lambdaConfig2)); // true
console.log("Lambda configs differ in nested objects:", deepEqual(lambdaConfig1, lambdaConfig3)); // false
