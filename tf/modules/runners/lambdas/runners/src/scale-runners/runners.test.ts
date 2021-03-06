import { listEC2Runners, createRunner, terminateRunner, RunnerInfo } from './runners';

const mockEC2 = { describeInstances: jest.fn(), runInstances: jest.fn(), terminateInstances: jest.fn() };
const mockSSM = { putParameter: jest.fn() };
jest.mock('aws-sdk', () => ({
  EC2: jest.fn().mockImplementation(() => mockEC2),
  SSM: jest.fn().mockImplementation(() => mockSSM),
}));

const LAUNCH_TEMPLATE = 'lt-1';
const ORG_NAME = 'SomeAwesomeCoder';
const REPO_NAME = `${ORG_NAME}/some-amazing-library`;
const ENVIRONMENT = 'unit-test-environment';

describe('list instances', () => {
  const mockDescribeInstances = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.describeInstances.mockImplementation(() => mockDescribeInstances);
    const mockRunningInstances: AWS.EC2.DescribeInstancesResult = {
      Reservations: [
        {
          Instances: [
            {
              LaunchTime: new Date('2020-10-10T14:48:00.000+09:00'),
              InstanceId: 'i-1234',
              Tags: [
                { Key: 'Application', Value: 'github-action-runner' },
                { Key: 'Type', Value: 'Org' },
                { Key: 'Owner', Value: 'CoderToCat' },
              ],
            },
            {
              LaunchTime: new Date('2020-10-11T14:48:00.000+09:00'),
              InstanceId: 'i-5678',
              Tags: [
                { Key: 'Owner', Value: REPO_NAME },
                { Key: 'Type', Value: 'Repo' },
                { Key: 'Application', Value: 'github-action-runner' },
              ],
            },
          ],
        },
      ],
    };
    mockDescribeInstances.promise.mockReturnValue(mockRunningInstances);
  });

  it('returns a list of instances', async () => {
    const resp = await listEC2Runners();
    expect(resp.length).toBe(2);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      type: 'Org',
      owner: 'CoderToCat',
    });
    expect(resp).toContainEqual({
      instanceId: 'i-5678',
      launchTime: new Date('2020-10-11T14:48:00.000+09:00'),
      type: 'Repo',
      owner: REPO_NAME,
    });
  });

  it('calls EC2 describe instances', async () => {
    await listEC2Runners();
    expect(mockEC2.describeInstances).toBeCalled();
  });

  it('filters instances on repo name', async () => {
    await listEC2Runners({ runnerType: 'Repo', runnerOwner: REPO_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Repo'] },
        { Name: 'tag:Owner', Values: [REPO_NAME] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    await listEC2Runners({ runnerType: 'Org', runnerOwner: ORG_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Org'] },
        { Name: 'tag:Owner', Values: [ORG_NAME] },
      ],
    });
  });

  it('filters instances on environment', async () => {
    await listEC2Runners({ environment: ENVIRONMENT });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Environment', Values: [ENVIRONMENT] },
      ],
    });
  });
});

describe('terminate runner', () => {
  const mockTerminateInstances = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.terminateInstances.mockImplementation(() => mockTerminateInstances);
    mockTerminateInstances.promise.mockReturnThis();
  });
  it('calls terminate instances with the right instance ids', async () => {
    const runner: RunnerInfo = {
      instanceId: 'instance-2',
      owner: 'owner-2',
      type: 'Repo',
    };
    await terminateRunner(runner.instanceId);

    expect(mockEC2.terminateInstances).toBeCalledWith({ InstanceIds: [runner.instanceId] });
  });
});

describe('create runner', () => {
  const mockRunInstances = { promise: jest.fn() };
  const mockPutParameter = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.runInstances.mockImplementation(() => mockRunInstances);
    mockRunInstances.promise.mockReturnValue({
      Instances: [
        {
          InstanceId: 'i-1234',
        },
      ],
    });
    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
    process.env.SUBNET_IDS = 'sub-1234';
  });

  it('calls run instances with the correct config for repo', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Repo',
        runnerOwner: REPO_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockEC2.runInstances).toBeCalledWith({
      MaxCount: 1,
      MinCount: 1,
      LaunchTemplate: { LaunchTemplateName: LAUNCH_TEMPLATE, Version: '$Default' },
      SubnetId: 'sub-1234',
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Application', Value: 'github-action-runner' },
            { Key: 'Type', Value: 'Repo' },
            { Key: 'Owner', Value: REPO_NAME },
          ],
        },
      ],
    });
  });

  it('calls run instances with the correct config for org', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockEC2.runInstances).toBeCalledWith({
      MaxCount: 1,
      MinCount: 1,
      LaunchTemplate: { LaunchTemplateName: LAUNCH_TEMPLATE, Version: '$Default' },
      SubnetId: 'sub-1234',
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Application', Value: 'github-action-runner' },
            { Key: 'Type', Value: 'Org' },
            { Key: 'Owner', Value: ORG_NAME },
          ],
        },
      ],
    });
  });

  it('creates ssm parameters for each created instance', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockSSM.putParameter).toBeCalledWith({
      Name: `${ENVIRONMENT}-i-1234`,
      Value: 'bla',
      Type: 'SecureString',
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockRunInstances.promise.mockReturnValue({
      Instances: [],
    });
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockSSM.putParameter).not.toBeCalled();
  });
});
