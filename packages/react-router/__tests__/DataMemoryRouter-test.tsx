/**
 * @jest-environment jsdom
 */

import * as React from "react";
import * as TestRenderer from "react-test-renderer";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  DataMemoryRouter as MemoryRouter,
  Route,
  useLoaderData,
  useActionData,
} from "../index";
import { Outlet } from "../lib/components";
import { useException, useNavigate, useTransition } from "../lib/hooks";
import { LoaderFunctionArgs } from "@remix-run/router";

describe("<DataMemoryRouter>", () => {
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("renders the first route that matches the URL", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Route path="/" element={<h1>Home</h1>} />
      </MemoryRouter>
    );

    expect(screen.getByText("Home")).toBeDefined();
  });

  it("renders with hydration data", async () => {
    render(
      <MemoryRouter
        initialEntries={["/child"]}
        hydrationData={{
          loaderData: {
            "0": "parent data",
            "0-0": "child data",
          },
          actionData: {
            "0": "parent action",
            "0-0": "child action",
          },
        }}
      >
        <Route path="/" element={<Comp />}>
          <Route path="child" element={<Comp />} />
        </Route>
      </MemoryRouter>
    );

    function Comp() {
      let data = useLoaderData();
      let actionData = useActionData();
      let transition = useTransition();
      return (
        <div>
          {data} | {actionData} | {transition.state}
          <Outlet />
        </div>
      );
    }

    expect(
      screen.getByText("parent data | parent action | idle")
    ).toBeDefined();
    expect(screen.getByText("child data | child action | idle")).toBeDefined();
  });

  it("handles link navigations", async () => {
    render(
      <MemoryRouter initialEntries={["/foo"]}>
        <Route path="/" element={<Layout />}>
          <Route path="foo" element={<Foo />} />
          <Route path="bar" element={<Bar />} />
        </Route>
      </MemoryRouter>
    );

    function Layout() {
      return (
        <div>
          <MemoryLink to="/foo">Link to Foo</MemoryLink>
          <MemoryLink to="/bar">Link to Bar</MemoryLink>
          <Outlet />
        </div>
      );
    }

    function Foo() {
      return <h1>Foo Heading</h1>;
    }

    function Bar() {
      return <h1>Bar Heading</h1>;
    }

    expect(screen.getByText("Foo Heading")).toBeDefined();
    fireEvent.click(screen.getByText("Link to Bar"));
    await waitFor(() => screen.getByText("Bar Heading"));

    fireEvent.click(screen.getByText("Link to Foo"));
    await waitFor(() => screen.getByText("Foo Heading"));
  });

  it("executes route loaders on navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/foo"]}>
        <Route path="/" element={<Layout />}>
          <Route path="foo" loader={fooLoader} element={<Foo />} />
          <Route path="bar" loader={barLoader} element={<Bar />} />
        </Route>
      </MemoryRouter>
    );

    function Layout() {
      return (
        <div>
          <MemoryLink to="/foo">Link to Foo</MemoryLink>
          <MemoryLink to="/bar">Link to Bar</MemoryLink>
          <Outlet />
        </div>
      );
    }

    function Foo() {
      let data = useLoaderData();
      return <h1>Foo: {data?.message}</h1>;
    }
    async function fooLoader(args: LoaderFunctionArgs) {
      await tick();
      return { message: "From Foo Loader" };
    }

    function Bar() {
      let data = useLoaderData();
      return <h1>Bar: {data?.message}</h1>;
    }
    async function barLoader(args: LoaderFunctionArgs) {
      await tick();
      return { message: "From Bar Loader" };
    }

    expect(screen.getByText("Foo:")).toBeDefined();
    fireEvent.click(screen.getByText("Link to Bar"));
    await waitFor(() => screen.getByText("Bar: From Bar Loader"));

    fireEvent.click(screen.getByText("Link to Foo"));
    await waitFor(() => screen.getByText("Foo: From Foo Loader"));
  });

  it("executes route loaders on navigation", async () => {
    let fooDefer = defer();
    let barDefer = defer();

    render(
      <MemoryRouter initialEntries={["/foo"]}>
        <Route path="/" element={<Layout />}>
          <Route path="foo" loader={() => fooDefer.promise} element={<Foo />} />
          <Route path="bar" loader={() => barDefer.promise} element={<Bar />} />
        </Route>
      </MemoryRouter>
    );

    function Layout() {
      let transition = useTransition();
      return (
        <div>
          <MemoryLink to="/foo">Link to Foo</MemoryLink>
          <MemoryLink to="/bar">Link to Bar</MemoryLink>
          <p>transition:{transition.state}</p>
          <Outlet />
        </div>
      );
    }

    function Foo() {
      let data = useLoaderData();
      return <h1>Foo: {data?.message}</h1>;
    }
    function Bar() {
      let data = useLoaderData();
      return <h1>Bar: {data?.message}</h1>;
    }

    expect(screen.getByText("Foo:")).toBeDefined();
    expect(screen.getByText("transition:idle")).toBeDefined();

    fireEvent.click(screen.getByText("Link to Bar"));
    expect(screen.getByText("transition:loading")).toBeDefined();
    barDefer.resolve({ message: "Bar Loader" });
    await waitFor(() => screen.getByText("transition:idle"));
    expect(screen.getByText("Bar: Bar Loader")).toBeDefined();

    fireEvent.click(screen.getByText("Link to Foo"));
    expect(screen.getByText("transition:loading")).toBeDefined();
    fooDefer.resolve({ message: "Foo Loader" });
    await waitFor(() => screen.getByText("transition:idle"));
    expect(screen.getByText("Foo: Foo Loader")).toBeDefined();
  });
});

async function tick() {
  await new Promise((r) => setImmediate(r));
}

function defer() {
  let resolve: (val?: any) => Promise<void>;
  let reject: (error?: Error) => Promise<void>;
  let promise = new Promise((res, rej) => {
    resolve = async (val: any) => {
      res(val);
      try {
        await promise;
      } catch (e) {}
    };
    reject = async (error?: Error) => {
      rej(error);
      try {
        await promise;
      } catch (e) {}
    };
  });
  return {
    promise,
    //@ts-ignore
    resolve,
    //@ts-ignore
    reject,
  };
}

function MemoryLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  let navigate = useNavigate();
  let onClickHandler = React.useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      event.preventDefault();
      navigate(to);
    },
    [navigate, to]
  );

  return <a href={to} onClick={onClickHandler} children={children}></a>;
}
