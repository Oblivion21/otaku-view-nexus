import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const carouselMocks = vi.hoisted(() => ({
  carouselSpy: vi.fn(),
  previousSpy: vi.fn(),
  nextSpy: vi.fn(),
}));

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children, ...props }: any) => {
    carouselMocks.carouselSpy(props);
    return (
      <div data-testid="carousel" dir={props.dir} className={props.className}>
        {children}
      </div>
    );
  },
  CarouselContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CarouselItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CarouselPrevious: (props: any) => {
    carouselMocks.previousSpy(props);
    return <button type="button">Previous</button>;
  },
  CarouselNext: (props: any) => {
    carouselMocks.nextSpy(props);
    return <button type="button">Next</button>;
  },
}));

import ContentRail from "@/components/ContentRail";

describe("ContentRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading rails with RTL direction and shared arrow positioning", () => {
    render(
      <ContentRail
        title="Latest"
        items={[]}
        loading
        emptyMessage="Nothing here"
        renderItem={() => null}
      />,
    );

    expect(screen.getByTestId("carousel")).toHaveAttribute("dir", "rtl");
    expect(carouselMocks.carouselSpy).toHaveBeenCalledWith(expect.objectContaining({ dir: "rtl" }));
    expect(carouselMocks.previousSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringMatching(/\bleft-0\b|\bright-0\b/),
      }),
    );
    expect(carouselMocks.nextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringMatching(/\bleft-0\b|\bright-0\b/),
      }),
    );
  });

  it("renders populated rails with RTL direction", () => {
    render(
      <ContentRail
        title="Latest"
        items={[{ id: 1, name: "Naruto" }]}
        emptyMessage="Nothing here"
        renderItem={(item) => <div>{item.name}</div>}
      />,
    );

    expect(screen.getByTestId("carousel")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(carouselMocks.carouselSpy).toHaveBeenCalledWith(expect.objectContaining({ dir: "rtl" }));
  });

  it("does not render empty carousel slides when renderItem returns null", () => {
    render(
      <ContentRail
        title="Latest"
        items={[
          { id: 1, name: "Naruto", hidden: false },
          { id: 2, name: "Hidden", hidden: true },
        ]}
        emptyMessage="Nothing here"
        renderItem={(item) => (item.hidden ? null : <div>{item.name}</div>)}
      />,
    );

    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Naruto|Previous|Next/)).toHaveLength(3);
  });
});
