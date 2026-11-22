// Spike #47: do video margins apply on the libmpv render path, and when changed at runtime?
//
// IINA draws video with vo=libmpv and the mpv render API (OpenGL, into the video view's FBO),
// not mpv's own window. A plain `mpv --vo=gpu` test therefore does not show that IINA's path
// honours the margins. This program uses the same vo (vo=libmpv, keepaspect=yes, as IINA sets
// in MPVController.swift) with the render API's software renderer, so the dst-rect computation
// (video/out/vo_libmpv.c -> mp_get_src_dst_rects) is the same code IINA's GL renderer reaches.
// The renderer differs (software, not OpenGL); that is the one thing this test cannot cover.
//
// Build: cc -o spike-47-libmpv-margin spike-47-libmpv-margin.c -I/opt/homebrew/include \
//          -L/opt/homebrew/lib -lmpv
// Run:   ./spike-47-libmpv-margin test.mp4 outdir
// Writes outdir/<step>.ppm for each step; analyse each with spike-47-bbox.py after converting
// (spike-47-libmpv.sh does both).

#include <mpv/client.h>
#include <mpv/render.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define W 1000
#define H 600

static void check(int status, const char *what)
{
    if (status < 0) {
        fprintf(stderr, "%s failed: %s\n", what, mpv_error_string(status));
        exit(1);
    }
}

static void wait_for_event(mpv_handle *mpv, mpv_event_id wanted)
{
    for (;;) {
        mpv_event *event = mpv_wait_event(mpv, 10.0);
        if (event->event_id == wanted)
            return;
        if (event->event_id == MPV_EVENT_SHUTDOWN || event->event_id == MPV_EVENT_NONE) {
            fprintf(stderr, "gave up waiting for event %d (got %d)\n", wanted, event->event_id);
            exit(1);
        }
    }
}

static void render_step(mpv_render_context *ctx, const char *outdir, const char *name)
{
    static unsigned char buffer[W * H * 4];
    memset(buffer, 0, sizeof buffer); // black, like IINA's glClear before mpv renders
    int size[2] = {W, H};
    size_t stride = W * 4;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_SW_SIZE, size},
        {MPV_RENDER_PARAM_SW_FORMAT, (void *)"rgb0"},
        {MPV_RENDER_PARAM_SW_STRIDE, &stride},
        {MPV_RENDER_PARAM_SW_POINTER, buffer},
        {MPV_RENDER_PARAM_INVALID, NULL},
    };
    mpv_render_context_update(ctx);
    check(mpv_render_context_render(ctx, params), "render");

    char path[1024];
    snprintf(path, sizeof path, "%s/%s.ppm", outdir, name);
    FILE *file = fopen(path, "wb");
    if (!file) {
        perror(path);
        exit(1);
    }
    fprintf(file, "P6\n%d %d\n255\n", W, H);
    for (int i = 0; i < W * H; i++)
        fwrite(buffer + i * 4, 1, 3, file); // rgb0 -> rgb
    fclose(file);
    printf("wrote %s\n", path);
}

static void set_margins(mpv_handle *mpv, const char *left, const char *right, const char *top,
                        const char *bottom)
{
    check(mpv_set_property_string(mpv, "video-margin-ratio-left", left), "set left");
    check(mpv_set_property_string(mpv, "video-margin-ratio-right", right), "set right");
    check(mpv_set_property_string(mpv, "video-margin-ratio-top", top), "set top");
    check(mpv_set_property_string(mpv, "video-margin-ratio-bottom", bottom), "set bottom");
}

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: %s video outdir\n", argv[0]);
        return 2;
    }
    mpv_handle *mpv = mpv_create();
    check(mpv ? 0 : -1, "mpv_create");
    mpv_set_option_string(mpv, "config", "no");
    mpv_set_option_string(mpv, "terminal", "no");
    mpv_set_option_string(mpv, "audio", "no");
    mpv_set_option_string(mpv, "vo", "libmpv");     // MPVController.swift: vo=libmpv
    mpv_set_option_string(mpv, "keepaspect", "yes"); // MPVController.swift: keepaspect=yes
    mpv_set_option_string(mpv, "pause", "yes");
    mpv_set_option_string(mpv, "hwdec", "no");
    check(mpv_initialize(mpv), "mpv_initialize");

    mpv_render_context *ctx = NULL;
    mpv_render_param create_params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_SW},
        {MPV_RENDER_PARAM_INVALID, NULL},
    };
    check(mpv_render_context_create(&ctx, mpv, create_params), "render_context_create");

    const char *load[] = {"loadfile", argv[1], NULL};
    check(mpv_command(mpv, load), "loadfile");
    wait_for_event(mpv, MPV_EVENT_PLAYBACK_RESTART);

    render_step(ctx, argv[2], "1-baseline");

    set_margins(mpv, "0", "0.3", "0", "0");
    render_step(ctx, argv[2], "2-right-0.3-set-at-runtime");

    set_margins(mpv, "0", "0.3", "0", "0.1");
    render_step(ctx, argv[2], "3-right-0.3-bottom-0.1");

    set_margins(mpv, "0", "0", "0", "0");
    render_step(ctx, argv[2], "4-reset-to-zero");

    mpv_render_context_free(ctx);
    mpv_terminate_destroy(mpv);
    return 0;
}
