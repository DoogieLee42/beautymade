import numpy as np

from app.reconstruction.texture import AtlasRaster, _continue_skin_where_grazing


def test_continues_the_skin_where_the_photo_only_grazes_the_face() -> None:
    raster = AtlasRaster(128)
    xx = np.broadcast_to(np.arange(128), (128, 128))
    skin = np.array([200, 160, 140])
    # A streaky photo everywhere, except plain skin on the half the camera sees well.
    albedo = np.random.default_rng(0).integers(0, 255, (128, 128, 3)).astype(np.uint8)
    albedo[raster.coverage & (xx < 64)] = skin
    score = np.where(raster.texel_x < 64, 1.0, 0.0)

    out = _continue_skin_where_grazing(albedo, raster, score)

    grazed = raster.coverage & (xx >= 70)
    assert np.abs(out[grazed].astype(int) - skin).max() <= 2
    well_seen = raster.coverage & (xx < 64)
    assert (out[well_seen] == albedo[well_seen]).all()
    assert (out[~raster.coverage] == albedo[~raster.coverage]).all()


def test_leaves_well_seen_faces_alone() -> None:
    raster = AtlasRaster(64)
    albedo = np.random.default_rng(1).integers(0, 255, (64, 64, 3)).astype(np.uint8)
    out = _continue_skin_where_grazing(albedo, raster, np.ones(len(raster.tri_id)))
    assert (out == albedo).all()
