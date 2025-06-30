const { deepEqual } = require('../index');

describe('deepEqual function', () => {
  it('should compare primitive values correctly', () => {
    // Equal primitives
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(123, 123)).toBe(true);
    expect(deepEqual('test', 'test')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(false, false)).toBe(true);
    
    // Different primitives
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(123, '123')).toBe(false);
    expect(deepEqual(true, 1)).toBe(false);
    expect(deepEqual('test', 'TEST')).toBe(false);
  });

  it('should compare arrays correctly', () => {
    // Equal arrays
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    
    // Nested arrays
    expect(deepEqual([1, [2, 3], 4], [1, [2, 3], 4])).toBe(true);
    
    // Different arrays
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, [2, 3], 4], [1, [2, 4], 4])).toBe(false);
  });

  it('should compare objects correctly', () => {
    // Equal objects
    expect(deepEqual({}, {})).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true); // Order doesn't matter
    
    // Nested objects
    expect(deepEqual(
      { a: 1, b: { c: 3, d: 4 } },
      { a: 1, b: { c: 3, d: 4 } }
    )).toBe(true);
    
    // Different objects
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual(
      { a: 1, b: { c: 3, d: 4 } },
      { a: 1, b: { c: 3, d: 5 } }
    )).toBe(false);
  });

  it('should handle mixed nested structures', () => {
    // Equal mixed structures
    const obj1 = {
      name: 'test',
      values: [1, 2, 3],
      nested: {
        a: [4, 5, 6],
        b: {
          c: 'deep',
          d: [7, 8, 9]
        }
      }
    };
    
    const obj2 = {
      name: 'test',
      values: [1, 2, 3],
      nested: {
        a: [4, 5, 6],
        b: {
          c: 'deep',
          d: [7, 8, 9]
        }
      }
    };
    
    expect(deepEqual(obj1, obj2)).toBe(true);
    
    // Different mixed structures
    const obj3 = {
      name: 'test',
      values: [1, 2, 3],
      nested: {
        a: [4, 5, 6],
        b: {
          c: 'deep',
          d: [7, 8, 10] // Changed value
        }
      }
    };
    
    expect(deepEqual(obj1, obj3)).toBe(false);
  });

  it('should correctly handle type mismatches', () => {
    // Array vs object
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ 0: 'a', 1: 'b', length: 2 }, ['a', 'b'])).toBe(false);
    
    // Object vs primitive
    expect(deepEqual({}, null)).toBe(false);
    expect(deepEqual({ value: 123 }, 123)).toBe(false);
    
    // Array vs primitive
    expect(deepEqual([], '')).toBe(false);
    expect(deepEqual([1, 2, 3], '123')).toBe(false);
  });

  it('should handle special edge cases', () => {
    // Empty objects and arrays
    expect(deepEqual({}, {})).toBe(true);
    expect(deepEqual([], [])).toBe(true);
    
    // Objects that look similar but have different keys
    expect(deepEqual(
      { a: undefined }, 
      { b: undefined }
    )).toBe(false);
    
    // Objects with same keys but different values
    expect(deepEqual(
      { a: undefined },
      { a: null }
    )).toBe(false);
  });

  it('should handle lambda function configuration objects correctly', () => {
    // Test with AWS Lambda function configuration objects
    const lambdaConfig1 = {
      FunctionName: 'test-function',
      Runtime: 'nodejs18.x',
      MemorySize: 512,
      Environment: {
        Variables: {
          ENV: 'production',
          DEBUG: 'false'
        }
      },
      VpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      }
    };
    
    const lambdaConfig2 = {
      FunctionName: 'test-function',
      Runtime: 'nodejs18.x',
      MemorySize: 512,
      Environment: {
        Variables: {
          ENV: 'production',
          DEBUG: 'false'
        }
      },
      VpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      }
    };
    
    expect(deepEqual(lambdaConfig1, lambdaConfig2)).toBe(true);
    
    // Change one nested property
    const lambdaConfig3 = {
      ...lambdaConfig1,
      Environment: {
        Variables: {
          ENV: 'development', // Changed from production
          DEBUG: 'false'
        }
      }
    };
    
    expect(deepEqual(lambdaConfig1, lambdaConfig3)).toBe(false);
  });
});
